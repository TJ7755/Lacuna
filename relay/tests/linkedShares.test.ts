import { afterEach, expect, it, vi } from 'vitest';
import { createHandler } from '../src/relay.js';
import { cleanupExpiredShares } from '../src/shares.js';
import { CHANNEL_TTL_MS, CHANNEL_CLEANUP_GRACE_MS } from '../src/channelMaintenance.js';
import { MemoryStore } from '../src/store.js';

const base = 'http://relay.test/shares';
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  vi.stubEnv('RELAY_MINT_SECRET', 'test');
  let now = Date.now();
  const store = new MemoryStore(() => now);
  const handle = createHandler(store, { now: () => now });
  async function mint(sourceShareId?: string) {
    const response = await handle(
      new Request(base, {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body: sourceShareId ? JSON.stringify({ sourceShareId }) : undefined,
      }),
    );
    expect(response.status).toBe(201);
    return response.json() as Promise<{ shareId: string; writeToken: string }>;
  }
  async function put(
    owner: { shareId: string; writeToken: string },
    slot: string,
    text: string,
    etag = '"0"',
  ) {
    return handle(
      new Request(`${base}/${owner.shareId}/${slot}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${owner.writeToken}`,
          'If-Match': etag,
          'Content-Length': String(text.length),
        },
        body: text,
      }),
    );
  }
  const source = await mint();
  await put(source, 'payload', 'course revision 1');
  const meta = await put(source, 'meta', 'revision 1');
  const get = (id: string, slot: string) => handle(new Request(`${base}/${id}/${slot}`));
  return {
    store,
    handle,
    source,
    meta,
    mint,
    put,
    get,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

it('follows publisher updates whilst keeping classroom keys, credentials and deletion independent', async () => {
  const ctx = await fixture();
  const first = await ctx.mint(ctx.source.shareId);
  const second = await ctx.mint(first.shareId);
  expect(await (await ctx.get(first.shareId, 'payload')).text()).toBe('course revision 1');
  const update = await ctx.put(ctx.source, 'meta', 'revision 2', ctx.meta.headers.get('ETag')!);
  const read = await ctx.get(second.shareId, 'meta');
  expect(await read.text()).toBe('revision 2');
  expect(read.headers.get('ETag')).toBe(update.headers.get('ETag'));
  expect((await ctx.put(first, 'payload', 'fork')).status).toBe(409);
  expect((await ctx.put(first, 'meta', 'fork')).status).toBe(409);
  expect(
    (await ctx.put({ ...ctx.source, writeToken: first.writeToken }, 'teacher', 'stolen')).status,
  ).toBe(401);
  expect((await ctx.put(first, 'teacher', 'first teacher')).status).toBe(204);
  expect((await ctx.put(second, 'teacher', 'second teacher')).status).toBe(204);
  expect(await (await ctx.get(first.shareId, 'teacher')).text()).toBe('first teacher');
  expect((await ctx.get(ctx.source.shareId, 'teacher')).status).toBe(404);
  await ctx.handle(
    new Request(`${base}/${first.shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${first.writeToken}` },
    }),
  );
  expect((await ctx.get(first.shareId, 'payload')).status).toBe(404);
  expect((await ctx.get(second.shareId, 'payload')).status).toBe(200);
  expect((await ctx.get(ctx.source.shareId, 'payload')).status).toBe(200);
  await ctx.handle(
    new Request(`${base}/${ctx.source.shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.source.writeToken}` },
    }),
  );
  expect((await ctx.get(second.shareId, 'payload')).status).toBe(404);
  expect(await (await ctx.get(second.shareId, 'teacher')).text()).toBe('second teacher');
});

it('rejects invalid, missing, unpublished and expired sources without minting a share', async () => {
  const ctx = await fixture();
  const empty = await ctx.mint();
  ctx.advance(CHANNEL_TTL_MS + 1);
  for (const sourceShareId of ['bad', 'a'.repeat(32), empty.shareId, ctx.source.shareId]) {
    const before = (await ctx.store.list('shares/')).length;
    const response = await ctx.handle(
      new Request(base, {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body: JSON.stringify({ sourceShareId }),
      }),
    );
    expect(response.status).toBe(sourceShareId === 'bad' ? 400 : 404);
    expect((await ctx.store.list('shares/')).length).toBe(before);
  }
  const oversized = await ctx.handle(
    new Request(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: 'x'.repeat(129),
    }),
  );
  expect(oversized.status).toBe(413);
});

it('expires and sweeps linked shares, including their source pointer', async () => {
  const ctx = await fixture();
  const linked = await ctx.mint(ctx.source.shareId);
  ctx.advance(CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1);
  expect((await ctx.get(linked.shareId, 'meta')).status).toBe(404);
  await cleanupExpiredShares(ctx.store, ctx.now());
  expect(await ctx.store.list('shares/')).toEqual([]);
});

it('keeps a class link live when its publisher continues publishing updates', async () => {
  const ctx = await fixture();
  const linked = await ctx.mint(ctx.source.shareId);
  ctx.advance(CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1);
  // An active publisher refreshed the course before maintenance ran.
  await ctx.store.put(`shares/${ctx.source.shareId}/meta`, new TextEncoder().encode('revision 2'), {
    overwrite: true,
  });
  expect((await ctx.get(linked.shareId, 'meta')).status).toBe(200);
  await cleanupExpiredShares(ctx.store, ctx.now());
  expect(await ctx.store.get(`shares/${linked.shareId}/auth`)).not.toBeNull();
});
