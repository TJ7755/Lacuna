import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';
import { sealGapsConnection } from './connectionFile';
import { createGapsConnectionStore } from './connectionStore';

const phrase = 'several separate words kept for this connection';
let name: string;
let stores: ReturnType<typeof createGapsConnectionStore>[];
beforeEach(() => {
  name = `gaps-connections-${crypto.randomUUID()}`;
  stores = [];
  vi.stubEnv('RELAY_MINT_SECRET', 'connection-test');
});
afterEach(async () => {
  vi.restoreAllMocks();
  stores.forEach((store) => store.close());
  await Dexie.delete(name);
  vi.unstubAllEnvs();
});

it('does not claim a connection when its commit fails or verification is cancelled', async () => {
  const { text, fetchImpl } = await fixture();
  const store = openStore();
  const commit = vi
    .spyOn(Dexie.prototype, 'transaction')
    .mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
  await expect(store.connect(text, phrase, { fetchImpl })).rejects.toThrow('Storage full');
  expect(await store.list()).toEqual([]);
  commit.mockRestore();
  const controller = new AbortController();
  fetchImpl.mockImplementationOnce(async () => {
    controller.abort();
    return new Response(null, { status: 204 });
  });
  await expect(
    store.connect(text, phrase, { fetchImpl, signal: controller.signal }),
  ).rejects.toThrow();
  expect(await store.list()).toEqual([]);
});
function openStore() {
  const store = createGapsConnectionStore(name);
  stores.push(store);
  return store;
}

async function fixture() {
  const relay = new MemoryStore();
  const handle = createHandler(relay);
  const response = await handle(
    new Request(`${DEFAULT_RELAY_URL}/shares`, {
      method: 'POST',
      headers: { Authorization: 'Bearer connection-test' },
    }),
  );
  const owner = (await response.json()) as { shareId: string; writeToken: string };
  const text = await sealGapsConnection(
    { ...owner, relayUrl: DEFAULT_RELAY_URL, courseName: 'GCSE Biology' },
    phrase,
  );
  const fetchImpl = vi.fn<typeof fetch>((url, init) => handle(new Request(url, init)));
  return { owner, text, fetchImpl, relay };
}

it('verifies ownership, commits only encrypted credentials, and restores its course list after reload', async () => {
  const { owner, text, fetchImpl, relay } = await fixture();
  const writes = vi.spyOn(relay, 'put');
  const store = openStore();
  await store.connect(text, phrase, { fetchImpl });
  await store.connect(text, phrase, { fetchImpl });
  expect(await store.unlock(owner.shareId, phrase)).toMatchObject({
    ...owner,
    courseName: 'GCSE Biology',
  });
  await expect(store.unlock(owner.shareId, 'wrong phrase')).rejects.toThrow();
  expect(await store.unlock('a'.repeat(32), phrase)).toBeNull();
  expect(writes).not.toHaveBeenCalled();
  store.close();
  const courses = await openStore().list();
  expect(courses).toEqual([
    { shareId: owner.shareId, courseName: 'GCSE Biology', verifiedAt: expect.any(Number) },
  ]);
  const inspection = new Dexie(name);
  await inspection.open();
  const saved = JSON.stringify(await inspection.table('connections').toArray());
  inspection.close();
  expect(saved).not.toContain(owner.writeToken);
  expect(saved).not.toContain(phrase);
  await stores.at(-1)!.forget(owner.shareId);
  expect(await stores.at(-1)!.list()).toEqual([]);
  expect(await relay.get(`shares/${owner.shareId}/auth`)).not.toBeNull();
});

it('rejects invalid phrases and failed ownership without replacing a saved connection', async () => {
  const { owner, text, fetchImpl } = await fixture();
  const store = openStore();
  await store.connect(text, phrase, { fetchImpl });
  fetchImpl.mockClear();
  await expect(store.connect(text, 'wrong phrase', { fetchImpl })).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
  for (const status of [200, 401, 404, 410, 503]) {
    fetchImpl.mockResolvedValueOnce(new Response(null, { status }));
    await expect(store.connect(text, phrase, { fetchImpl })).rejects.toMatchObject({ status });
  }
  expect((await store.list()).map((course) => course.shareId)).toEqual([owner.shareId]);
});
