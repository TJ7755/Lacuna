import { afterEach, expect, it, vi } from 'vitest';
import { createHandler } from '../src/relay.js';
import { MemoryStore } from '../src/store.js';
import { CHANNEL_TTL_MS } from '../src/channelMaintenance.js';

afterEach(() => vi.unstubAllEnvs());

it.each(['shares', 'api/shares', 'api?__path=/shares'])(
  'checks %s ownership without writing, deleting or returning course bytes',
  async (route) => {
    vi.stubEnv('RELAY_MINT_SECRET', 'owner-check-test');
    let now = Date.parse('2026-10-19T00:00:00Z');
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    const minted = await handle(
      new Request('https://relay.example/shares', {
        method: 'POST',
        headers: { Authorization: 'Bearer owner-check-test' },
      }),
    );
    const { shareId, writeToken } = (await minted.json()) as {
      shareId: string;
      writeToken: string;
    };
    await store.put(`shares/${shareId}/payload`, new Uint8Array(1_928_490), { exclusive: true });
    await store.put(`shares/${shareId}/meta`, new TextEncoder().encode('{}'), { exclusive: true });
    const get = store.get.bind(store);
    let bodyBytesRead = 0;
    vi.spyOn(store, 'get').mockImplementation(async (key) => {
      const stored = await get(key);
      bodyBytesRead += stored?.body.byteLength ?? 0;
      return stored;
    });
    const put = vi.spyOn(store, 'put');
    const del = vi.spyOn(store, 'del');
    const list = vi.spyOn(store, 'list');
    const check = (token?: string, id = shareId) =>
      handle(
        new Request(`https://relay.example/${route}/${id}`, {
          method: 'HEAD',
          headers: {
            Origin: 'https://gaps.getlacuna.app',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }),
      );
    for (const [token, expected] of [
      [undefined, 401],
      ['wrong', 401],
      [writeToken, 204],
    ] as const) {
      bodyBytesRead = 0;
      const response = await check(token);
      expect(response.status).toBe(expected);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://gaps.getlacuna.app',
      );
      expect(bodyBytesRead).toBe(token ? 32 : 0);
    }
    for (const id of ['f'.repeat(32), 'invalid']) {
      const response = await check(writeToken, id);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    now += CHANNEL_TTL_MS;
    expect((await check()).status).toBe(401);
    bodyBytesRead = 0;
    const expired = await check(writeToken);
    expect(expired.status).toBe(410);
    expect(await expired.text()).toBe('');
    expect(expired.headers.get('Cache-Control')).toBe('no-store');
    expect(bodyBytesRead).toBe(32);
    expect(await store.get(`shares/${shareId}/auth`)).not.toBeNull();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    await store.del([`shares/${shareId}/auth`]);
    del.mockClear();
    bodyBytesRead = 0;
    const orphaned = await check(writeToken);
    expect(orphaned.status).toBe(404);
    expect(await orphaned.text()).toBe('');
    expect(bodyBytesRead).toBe(0);
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  },
);

it('permits an authorised browser HEAD preflight', async () => {
  const response = await createHandler(new MemoryStore())(
    new Request('https://relay.example/shares/' + 'a'.repeat(32), {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://gaps.getlacuna.app',
        'Access-Control-Request-Method': 'HEAD',
        'Access-Control-Request-Headers': 'Authorization',
      },
    }),
  );
  expect(response.status).toBe(204);
  expect(
    response.headers
      .get('Access-Control-Allow-Methods')
      ?.split(',')
      .map((method) => method.trim()),
  ).toContain('HEAD');
});
