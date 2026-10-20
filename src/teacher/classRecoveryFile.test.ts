import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { createInsightsOwner } from '../insights/envelope';
import { serialiseInsightsRecoveryFile } from '../insights/recoveryFile';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';
import { parseGapsConnectionFile, sealGapsConnection } from './connectionFile';
import { createGapsConnectionStore } from './connectionStore';
import {
  CLASS_RECOVERY_FILE_MAX_BYTES,
  parseClassRecoveryFile,
  serialiseClassRecoveryFile,
  restoreClassRecovery,
} from './classRecoveryFile';
const shareId = 'a'.repeat(32);
const code = '0123456789ABCDEFGHJKMNPQ';
async function fixture() {
  const connection = parseGapsConnectionFile(
    await sealGapsConnection(
      { shareId, courseName: 'Biology', relayUrl: DEFAULT_RELAY_URL, writeToken: 'b'.repeat(64) },
      code,
    ),
  );
  const owner = await createInsightsOwner(code, shareId);
  const recovery = JSON.parse(serialiseInsightsRecoveryFile(shareId, owner.recovery));
  return { connection, recovery, owner };
}
afterEach(async () => {
  await Dexie.delete('lacuna.gaps.connections');
  await Dexie.delete('lacuna.gaps.owner-keys');
});
it('round trips sealed halves without exposing the code', async () => {
  const { connection, recovery } = await fixture();
  const text = serialiseClassRecoveryFile(shareId, connection, recovery);
  expect(parseClassRecoveryFile(text)).toEqual({
    kind: 'lacuna-gaps-class',
    v: 1,
    shareId,
    connection,
    recovery,
  });
  expect(text).not.toContain(code);
  expect(CLASS_RECOVERY_FILE_MAX_BYTES).toBeLessThanOrEqual(24 * 1024);
});
it('rejects mismatched bindings, kinds, versions and oversized files', async () => {
  const { connection, recovery } = await fixture();
  const raw = JSON.parse(serialiseClassRecoveryFile(shareId, connection, recovery));
  for (const invalid of [
    { ...raw, kind: 'wrong' },
    { ...raw, v: 2 },
    { ...raw, shareId: 'c'.repeat(32) },
    { ...raw, recovery: { ...recovery, shareId: 'c'.repeat(32) } },
    { ...raw, connection: { ...connection, shareId: 'c'.repeat(32) } },
  ])
    expect(() => parseClassRecoveryFile(JSON.stringify(invalid))).toThrow();
  expect(() => parseClassRecoveryFile(' '.repeat(CLASS_RECOVERY_FILE_MAX_BYTES + 1))).toThrow();
});
it('restores both halves on a fresh database and retries a failed relay check', async () => {
  const { connection, recovery } = await fixture();
  const file = parseClassRecoveryFile(serialiseClassRecoveryFile(shareId, connection, recovery));
  const fetchImpl: typeof fetch = async () => new Response(null, { status: 204 });
  await expect(
    restoreClassRecovery(file, code, false, {
      fetchImpl: async () => new Response(null, { status: 503 }),
    }),
  ).rejects.toThrow('Could not open class recovery. Check the file and recovery code.');
  const session = await restoreClassRecovery(file, code, false, { fetchImpl });
  expect(session.connection.shareId).toBe(shareId);
  const connections = createGapsConnectionStore(),
    keys = createInsightsOwnerStore();
  try {
    expect((await connections.list())[0].secret).toBe('recovery-code');
    expect(await connections.unlock(shareId, code)).toEqual(session.connection);
    expect((await keys.unlock(shareId, code))?.recipient).toEqual(session.owner.recipient);
  } finally {
    connections.close();
    keys.close();
  }
});
it('rejects a wrong code without saving a connection', async () => {
  const { connection, recovery } = await fixture();
  const file = parseClassRecoveryFile(serialiseClassRecoveryFile(shareId, connection, recovery));
  await expect(restoreClassRecovery(file, 'Z'.repeat(24), false)).rejects.toThrow();
  const store = createGapsConnectionStore();
  try {
    expect(await store.list()).toEqual([]);
  } finally {
    store.close();
  }
});
