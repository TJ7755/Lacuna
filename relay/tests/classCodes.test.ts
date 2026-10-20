import { afterEach, expect, it, vi } from 'vitest';
import { createHandler, parseRoute } from '../src/relay.js';
import { cleanupExpiredShares } from '../src/shares.js';
import { CHANNEL_TTL_MS, CHANNEL_CLEANUP_GRACE_MS } from '../src/channelMaintenance.js';
import { MemoryStore } from '../src/store.js';

const origin = 'https://getlacuna.app';
const encode = (value: string) => new TextEncoder().encode(value);
afterEach(() => vi.unstubAllEnvs());

async function fixture(teacher = true) {
  vi.stubEnv('RELAY_MINT_SECRET', 'test-secret');
  let now = 0;
  const store = new MemoryStore(() => now);
  const handle = createHandler(store, { now: () => now });
  const minted = await handle(
    new Request('https://relay.test/shares', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    }),
  );
  const { shareId, writeToken } = (await minted.json()) as { shareId: string; writeToken: string };
  if (teacher)
    await store.put(`shares/${shareId}/teacher`, encode('public key'), { exclusive: true });
  const create = (token: string | null = writeToken) =>
    handle(
      new Request(`https://relay.test/shares/${shareId}/class-code`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}`, Origin: origin } : { Origin: origin },
      }),
    );
  const lookup = (code: string) =>
    handle(
      new Request(`https://relay.test/class-codes/${code}`, {
        headers: { Origin: origin, 'x-forwarded-for': '198.51.100.1' },
      }),
    );
  const allocate = async () => {
    const response = await create();
    expect(response.status).toBe(201);
    return ((await response.json()) as { code: string }).code;
  };
  return {
    store,
    handle,
    shareId,
    writeToken,
    create,
    lookup,
    allocate,
    advance: (ms: number) => {
      now += ms;
      return now;
    },
  };
}

it('requires owner authentication and a live teacher slot, and returns one stable canonical code', async () => {
  const f = await fixture(false);
  expect((await f.create(null)).status).toBe(401);
  expect((await f.create('wrong')).status).toBe(401);
  const missing = await f.create();
  expect(missing.status).toBe(409);
  expect(await missing.json()).toEqual({ error: 'teacher key required' });
  await f.store.put(`shares/${f.shareId}/teacher`, encode('public key'), { exclusive: true });
  const code = await f.allocate();
  expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  expect(new TextDecoder().decode((await f.store.get(`class-codes/${code}`))!.body)).toBe(
    f.shareId,
  );
  const repeat = await f.create();
  expect(repeat.status).toBe(200);
  expect(await repeat.json()).toEqual({ code });
  const found = await f.lookup(code);
  expect(found.status).toBe(200);
  expect(await found.json()).toEqual({ shareId: f.shareId });
  expect(found.headers.get('Cache-Control')).toBe('no-store');
  expect(found.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  f.advance(CHANNEL_TTL_MS);
  expect((await f.create()).status).toBe(409);
});

it('retries an exclusive mapping collision and stops after five collisions', async () => {
  const f = await fixture();
  const put = f.store.put.bind(f.store);
  let collisions = 1;
  const spy = vi.spyOn(f.store, 'put').mockImplementation((key, body, options) => {
    if (key.startsWith('class-codes/') && collisions-- > 0)
      return Promise.resolve({ ok: false, reason: 'precondition' });
    return put(key, body, options);
  });
  await f.allocate();
  expect(spy.mock.calls.filter(([key]) => key.startsWith('class-codes/'))).toHaveLength(2);
  await f.store.del([`shares/${f.shareId}/class-code`]);
  collisions = 5;
  expect((await f.create()).status).toBe(500);
  expect(collisions).toBe(0);
});

it('concurrent owner requests return the same code and leave only one mapping', async () => {
  const f = await fixture();
  const responses = await Promise.all([f.create(), f.create()]);
  const values = await Promise.all(responses.map((r) => r.json()));
  expect(values[0]).toEqual(values[1]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
  expect(await f.store.list('class-codes/')).toHaveLength(1);
});

it.each(['k7qm4xtp', 'K7QM-4XTP', 'K7QM4XTU', '1234567', '123456789'])(
  'rejects non-canonical lookup %s',
  async (code) => {
    const f = await fixture();
    expect((await f.lookup(code)).status).toBe(404);
    expect(await f.store.list('ai-rate/class-code/')).toHaveLength(0);
  },
);

it('admits 600 lookups from one address, limits the 601st and resets after an hour', async () => {
  const f = await fixture();
  const code = await f.allocate();
  for (let i = 0; i < 600; i++) expect((await f.lookup(code)).status).toBe(200);
  const limited = await f.lookup(code);
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: 'rate limited' });
  f.advance(60 * 60 * 1000);
  expect((await f.lookup(code)).status).toBe(200);
});

it.each(['auth', 'teacher', 'class-code'])(
  'refuses lookup without the matching %s object',
  async (slot) => {
    const f = await fixture();
    const code = await f.allocate();
    await f.store.del([`shares/${f.shareId}/${slot}`]);
    expect((await f.lookup(code)).status).toBe(404);
  },
);

it('refuses a mismatched pointer', async () => {
  const f = await fixture();
  const code = await f.allocate();
  await f.store.put(`shares/${f.shareId}/class-code`, encode('12345678'), { overwrite: true });
  expect((await f.lookup(code)).status).toBe(404);
});

it.each(['delete', 'lookup-expired', 'sweep-expired'])(
  'removes both keys on %s',
  async (action) => {
    const f = await fixture();
    const code = await f.allocate();
    if (action === 'delete') {
      const removed = await f.handle(
        new Request(`https://relay.test/shares/${f.shareId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${f.writeToken}` },
        }),
      );
      expect(removed.status).toBe(204);
    } else {
      const now = f.advance(CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1);
      if (action === 'sweep-expired') await cleanupExpiredShares(f.store, now);
    }
    expect((await f.lookup(code)).status).toBe(404);
    expect(await f.store.get(`class-codes/${code}`)).toBeNull();
    expect(await f.store.get(`shares/${f.shareId}/class-code`)).toBeNull();
  },
);

it('cleans orphan mappings left by interrupted allocation without disturbing live codes', async () => {
  const f = await fixture();
  const code = await f.allocate();
  await f.store.put('class-codes/12345678', encode('b'.repeat(32)), { exclusive: true });
  await f.store.put('class-codes/87654321', encode(f.shareId), { exclusive: true });
  await cleanupExpiredShares(f.store, f.advance(CHANNEL_CLEANUP_GRACE_MS + 1));
  expect(await f.store.get('class-codes/12345678')).toBeNull();
  expect(await f.store.get('class-codes/87654321')).toBeNull();
  expect((await f.lookup(code)).status).toBe(200);
});

it.each(['', '/api', '/api?__path='])('routes public, API and rewritten lookups (%s)', (prefix) => {
  expect(parseRoute(`https://relay.test${prefix}/class-codes/12345678`)).toEqual({
    kind: 'class-code',
    code: '12345678',
  });
});

it('revokes a code allocated while the owner deletes the share', async () => {
  const f = await fixture();
  const put = f.store.put.bind(f.store);
  vi.spyOn(f.store, 'put').mockImplementation(async (key, body, options) => {
    if (key === `shares/${f.shareId}/class-code`) {
      const deleted = await f.handle(
        new Request(`https://relay.test/shares/${f.shareId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${f.writeToken}` },
        }),
      );
      expect(deleted.status).toBe(204);
    }
    return put(key, body, options);
  });
  expect((await f.create()).status).toBe(404);
  expect(await f.store.list('class-codes/')).toHaveLength(0);
  expect(await f.store.list(`shares/${f.shareId}/`)).toHaveLength(0);
});
