import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInsightsOwner, openInsightEnvelope, sealInsightEnvelope } from './envelope';
import { createInsightsOwnerStore, InsightsOwnerConflictError } from './ownerStore';

const shareId = 'a'.repeat(32);
const passphrase = 'a teacher keeps this long phrase offline';
let databaseName: string;
let stores: ReturnType<typeof createInsightsOwnerStore>[];

beforeEach(() => {
  databaseName = `gaps-owner-test-${crypto.randomUUID()}`;
  stores = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of stores) store.close();
  await Dexie.delete(databaseName);
});

function openStore() {
  const store = createInsightsOwnerStore(databaseName);
  stores.push(store);
  return store;
}

describe('isolated teacher key storage', () => {
  it('persists only encrypted recovery material and unlocks after reopening', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const first = openStore();
    const owner = await first.create(shareId, passphrase);
    const context = { shareId, isoDay: '2026-10-18' };
    const evidence = new TextEncoder().encode('question-4: 3/5');
    const envelope = await sealInsightEnvelope(owner.recipient, evidence, context);
    first.close();

    const reopened = openStore();
    const unlocked = (await reopened.unlock(shareId, passphrase))!;
    expect(unlocked.recipient).toEqual(owner.recipient);
    expect(unlocked.privateKey.extractable).toBe(false);
    expect(await openInsightEnvelope(unlocked, envelope, context)).toEqual(evidence);

    const inspection = new Dexie(databaseName);
    try {
      await inspection.open();
      const raw = await inspection.table('owners').get(shareId);
      expect(Object.keys(raw).sort()).toEqual(['recovery', 'shareId']);
      expect(raw.recovery).toEqual(owner.recovery);
      expect(JSON.stringify(raw)).not.toContain(passphrase);
      expect(JSON.stringify(raw)).not.toContain('privateKey');
    } finally {
      inspection.close();
    }
    expect((await indexedDB.databases()).map((database) => database.name)).not.toContain('lacuna');
    expect(fetch).not.toHaveBeenCalled();
  }, 30_000);

  it('does not create a key while looking up a missing course', async () => {
    const store = openStore();
    expect(await store.unlock(shareId, passphrase)).toBeNull();
    await expect(store.unlock('invalid', passphrase)).rejects.toThrow('share');
  });

  it('keeps exactly one key when two teacher tabs create it concurrently', async () => {
    const first = openStore(),
      second = openStore();
    const results = await Promise.allSettled([
      first.create(shareId, passphrase),
      second.create(shareId, passphrase),
    ]);
    const accepted = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsightsOwnerConflictError);
    expect((await first.unlock(shareId, passphrase))!.recipient).toEqual(
      accepted[0].value.recipient,
    );
  }, 30_000);

  it('restores a saved recovery file and refuses wrong passphrases or another course', async () => {
    const original = await createInsightsOwner(passphrase, shareId);
    const store = openStore();
    await expect(store.restore(shareId, original.recovery, 'wrong')).rejects.toThrow();
    await expect(store.restore('b'.repeat(32), original.recovery, passphrase)).rejects.toThrow();
    expect(await store.unlock(shareId, passphrase)).toBeNull();
    expect(await store.unlock('b'.repeat(32), passphrase)).toBeNull();
    const restored = await store.restore(
      shareId,
      JSON.parse(JSON.stringify(original.recovery)),
      passphrase,
    );
    expect(restored.recipient).toEqual(original.recipient);
    expect((await store.unlock(shareId, passphrase))!.recipient).toEqual(original.recipient);
  }, 30_000);

  it('refuses silent key replacement and keeps existing history decryptable', async () => {
    const store = openStore();
    const original = await store.create(shareId, passphrase);
    const other = await createInsightsOwner(passphrase, shareId);
    await expect(store.create(shareId, passphrase)).rejects.toBeInstanceOf(
      InsightsOwnerConflictError,
    );
    await expect(store.restore(shareId, other.recovery, passphrase)).rejects.toBeInstanceOf(
      InsightsOwnerConflictError,
    );
    await store.restore(shareId, original.recovery, passphrase);
    expect((await store.unlock(shareId, passphrase))!.recipient).toEqual(original.recipient);
  }, 30_000);

  it('does not report a newly generated key as saved after a failed commit', async () => {
    const store = openStore();
    const failure = new DOMException('Storage is full', 'QuotaExceededError');
    const commit = vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(failure);
    await expect(store.create(shareId, passphrase)).rejects.toThrow('Storage is full');
    commit.mockRestore();
    expect(await store.unlock(shareId, passphrase)).toBeNull();
  }, 30_000);
});
