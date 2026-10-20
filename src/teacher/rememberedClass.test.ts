import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as ownerStore from '../insights/ownerStore';
import * as connectionStore from './connectionStore';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';
import { sealGapsConnection } from './connectionFile';
import { createGapsConnectionStore } from './connectionStore';
import { forgetRememberedClass, readRememberedClass, rememberClass } from './rememberedClass';

const shareId = 'a'.repeat(32);
const phrase = 'several separate teacher words kept offline';
let connections: ReturnType<typeof createGapsConnectionStore>;
let keys: ReturnType<typeof createInsightsOwnerStore>;
beforeEach(() => {
  connections = createGapsConnectionStore();
  keys = createInsightsOwnerStore();
});
afterEach(async () => {
  vi.restoreAllMocks();
  connections.close();
  keys.close();
  await Dexie.delete('lacuna.gaps.connections');
  await Dexie.delete('lacuna.gaps.owner-keys');
});

async function fixture() {
  const connection = {
    shareId,
    courseName: 'Biology',
    relayUrl: DEFAULT_RELAY_URL,
    writeToken: 'b'.repeat(64),
  };
  await connections.connect(await sealGapsConnection(connection, phrase), phrase, {
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  const owner = await keys.create(shareId, phrase);
  return { connection, owner, days: new Map() };
}

it('reopens a complete session and forgets both credentials without removing the connection or recovery', async () => {
  const session = await fixture();
  expect(await rememberClass(session)).toBe(true);
  expect(await readRememberedClass(shareId)).toMatchObject({
    connection: session.connection,
    remembered: true,
  });
  await forgetRememberedClass(shareId);
  expect(await readRememberedClass(shareId)).toBeUndefined();
  expect(await connections.readRemembered(shareId)).toBeNull();
  expect(await keys.readRemembered(shareId)).toBeNull();
  expect(await connections.unlock(shareId, phrase)).toEqual(session.connection);
  expect((await keys.unlock(shareId, phrase))!.recipient).toEqual(session.owner.recipient);
  await rememberClass(session);
  await connections.forget(shareId);
  expect(await keys.readRemembered(shareId)).toBeNull();
  expect(await connections.readRemembered(shareId)).toBeNull();
});

it('deletes both device entries if the recovery recipient no longer matches', async () => {
  const session = await fixture();
  await rememberClass(session);
  const inspection = new Dexie('lacuna.gaps.owner-keys');
  await inspection.open();
  await inspection.table('remembered').update(shareId, { keyId: 'wrong' });
  inspection.close();
  expect(await readRememberedClass(shareId)).toBeUndefined();
  expect(await connections.readRemembered(shareId)).toBeNull();
  expect(await keys.readRemembered(shareId)).toBeNull();
});

it.each(['connection', 'key'] as const)(
  'falls back when only the %s artefact exists',
  async (remaining) => {
    const session = await fixture();
    await rememberClass(session);
    await (remaining === 'connection' ? keys : connections).forgetRemembered(shareId);
    expect(await readRememberedClass(shareId)).toBeUndefined();
    expect(await connections.readRemembered(shareId)).toBeNull();
    expect(await keys.readRemembered(shareId)).toBeNull();
  },
);

it.each(['connection', 'key'] as const)(
  'still deletes the other artefact when %s deletion fails',
  async (failing) => {
    const session = await fixture();
    await rememberClass(session);
    const failure = new Error('Deletion failed');
    if (failing === 'connection') {
      vi.spyOn(connectionStore, 'createGapsConnectionStore').mockReturnValueOnce({
        ...connections,
        forgetRemembered: vi.fn().mockRejectedValue(failure),
        close: vi.fn(),
      });
    } else {
      vi.spyOn(ownerStore, 'createInsightsOwnerStore').mockReturnValueOnce({
        ...keys,
        forgetRemembered: vi.fn().mockRejectedValue(failure),
        close: vi.fn(),
      });
    }
    await expect(forgetRememberedClass(shareId)).rejects.toThrow(failure);
    expect(
      await (failing === 'connection' ? keys : connections).readRemembered(shareId),
    ).toBeNull();
    expect(
      await (failing === 'connection' ? connections : keys).readRemembered(shareId),
    ).not.toBeNull();
  },
);
