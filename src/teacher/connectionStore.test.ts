import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { DEFAULT_RELAY_URL } from '../sync/pairingConfig';
import { sealGapsConnection } from './connectionFile';
import { createGapsConnectionStore } from './connectionStore';
import { formatClassCode } from '../insights/classCode';

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

it.each(['course', 'invitation', 'class-link'] as const)(
  'creates an independent class from a %s and exports recoverable encrypted credentials',
  async (kind) => {
    const { owner: source, fetchImpl, relay } = await fixture();
    await relay.put(`shares/${source.shareId}/payload`, new TextEncoder().encode('course'), {
      exclusive: true,
    });
    await relay.put(
      `shares/${source.shareId}/meta`,
      new TextEncoder().encode(
        JSON.stringify({
          v: 1,
          lineageId: 'source-lineage',
          revision: 3,
          publishedAt: Date.now(),
          byteSize: 6,
          courseName: 'Published biology',
        }),
      ),
      { exclusive: true },
    );
    const store = openStore();
    const code = formatClassCode({ shareId: source.shareId, keyId: 'c'.repeat(64) });
    const link =
      kind === 'course'
        ? `https://getlacuna.app/#/s/${source.shareId}`
        : kind === 'invitation'
          ? code
          : `https://getlacuna.app/#/s/${code}`;
    const classId = await store.createFromLink(link, phrase, { fetchImpl });
    expect(classId).not.toBe(source.shareId);
    const connection = await store.unlock(classId, phrase);
    expect(connection?.writeToken).not.toBe(source.writeToken);
    const text = await store.exportConnection(classId);
    expect(text).not.toContain(connection!.writeToken);
    expect(text).not.toContain(phrase);
    await store.forget(classId);
    await store.connect(text, phrase, { fetchImpl });
    expect(await store.list()).toEqual([
      { shareId: classId, courseName: 'Published biology', verifiedAt: expect.any(Number) },
    ]);
    expect(
      (await relay.list(`shares/${classId}/`)).map(({ key }) => key.split('/').pop()).sort(),
    ).toEqual(['auth', 'source']);
  },
);

it('removes the newly minted class if its local commit fails, preserving the publisher', async () => {
  const { owner: source, fetchImpl, relay } = await fixture();
  await relay.put(`shares/${source.shareId}/payload`, new TextEncoder().encode('course'), {
    exclusive: true,
  });
  await relay.put(
    `shares/${source.shareId}/meta`,
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        lineageId: 'source-lineage',
        revision: 3,
        publishedAt: Date.now(),
        byteSize: 6,
        courseName: 'Biology',
      }),
    ),
    { exclusive: true },
  );
  const before = await relay.list('shares/');
  vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(new Error('Storage full'));
  const store = openStore();
  await expect(store.createFromLink(source.shareId, phrase, { fetchImpl })).rejects.toThrow(
    'Storage full',
  );
  expect(await store.list()).toEqual([]);
  expect(await relay.list('shares/')).toEqual(before);
});

it('rejects a weak passphrase before contacting the relay', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  await expect(
    openStore().createFromLink('a'.repeat(32), 'short', { fetchImpl }),
  ).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('refuses an older relay that ignores the source link instead of saving a frozen or empty class', async () => {
  const { owner: source, fetchImpl, relay } = await fixture();
  await relay.put(
    `shares/${source.shareId}/meta`,
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        lineageId: 'source-lineage',
        revision: 1,
        publishedAt: Date.now(),
        byteSize: 6,
        courseName: 'Biology',
      }),
    ),
    { exclusive: true },
  );
  const before = await relay.list('shares/');
  const oldRelay: typeof fetch = (url, init) =>
    fetchImpl(url, init?.method === 'POST' ? { ...init, body: undefined } : init);
  const store = openStore();
  await expect(
    store.createFromLink(source.shareId, phrase, { fetchImpl: oldRelay }),
  ).rejects.toThrow('could not connect');
  expect(await store.list()).toEqual([]);
  expect(await relay.list('shares/')).toEqual(before);
});

it('encrypts remembered tokens with a non-extractable device key and deletes them on forget or removal', async () => {
  const { owner, text, fetchImpl } = await fixture();
  const store = openStore();
  await store.connect(text, phrase, { fetchImpl });
  const connection = (await store.unlock(owner.shareId, phrase))!;
  expect(await store.rememberOnDevice(connection)).toBe(true);
  store.close();
  const reopened = openStore();
  expect(await reopened.readRemembered(owner.shareId)).toEqual(connection);
  const inspection = new Dexie(name);
  await inspection.open();
  const first = await inspection.table('remembered').get(owner.shareId);
  const device = await inspection.table('deviceKeys').get('device');
  expect(device.key.extractable).toBe(false);
  expect(device.key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  expect(first.nonce.byteLength).toBe(12);
  const raw = JSON.stringify(await Promise.all(inspection.tables.map((table) => table.toArray())));
  expect(raw).not.toContain(phrase);
  expect(raw).not.toContain(owner.writeToken);
  expect(new TextDecoder().decode(first.ciphertext)).not.toContain(owner.writeToken);
  await reopened.rememberOnDevice(connection);
  const second = await inspection.table('remembered').get(owner.shareId);
  expect(second.nonce).not.toEqual(first.nonce);
  await reopened.forgetRemembered(owner.shareId);
  expect(await reopened.readRemembered(owner.shareId)).toBeNull();
  expect(await reopened.unlock(owner.shareId, phrase)).toEqual(connection);
  await reopened.rememberOnDevice(connection);
  await reopened.forget(owner.shareId);
  expect(await inspection.table('remembered').count()).toBe(0);
  inspection.close();
});

it('silently declines remembering when the device key cannot be cloned', async () => {
  const { owner, text, fetchImpl } = await fixture();
  const store = openStore();
  await store.connect(text, phrase, { fetchImpl });
  const connection = (await store.unlock(owner.shareId, phrase))!;
  const commit = vi
    .spyOn(Dexie.prototype, 'transaction')
    .mockRejectedValueOnce(new DOMException('Cannot clone key', 'DataCloneError'));
  expect(await store.rememberOnDevice(connection)).toBe(false);
  commit.mockRestore();
  expect(await store.readRemembered(owner.shareId)).toBeNull();
  expect(await store.unlock(owner.shareId, phrase)).toEqual(connection);
});
