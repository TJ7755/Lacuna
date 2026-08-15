import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_TTL_MS, EMPTY_SLOT_ETAG, MAX_BODY_BYTES, createHandler } from '../src/relay.js';
import { MemoryStore } from '../src/store.js';

const ORIGIN = 'https://app.example';
const MINT_SECRET = 'test-relay-mint-secret';

beforeEach(() => {
  vi.stubEnv('RELAY_MINT_SECRET', MINT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('relay', () => {
  it('mints a channel and round-trips PUT/GET on both slots', async () => {
    const ctx = await minted();
    const state = new Uint8Array([0xde, 0xad, 0x01]);
    const keybag = new Uint8Array([0xbe, 0xef, 0x02]);

    const putState = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, state));
    expectCors(putState);
    expect(putState.status).toBe(204);
    const stateEtag = putState.headers.get('ETag');
    expect(stateEtag).toMatch(/^"[^"]+"$/);

    const putKeybag = await ctx.handle(putRequest(ctx.channelId, 'keybag', ctx.writeToken, EMPTY_SLOT_ETAG, keybag));
    expectCors(putKeybag);
    expect(putKeybag.status).toBe(204);
    const keybagEtag = putKeybag.headers.get('ETag');
    expect(keybagEtag).toMatch(/^"[^"]+"$/);
    expect(keybagEtag).not.toBe(stateEtag);

    const gotState = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expectCors(gotState);
    expect(gotState.status).toBe(200);
    expect(gotState.headers.get('ETag')).toBe(stateEtag);
    expect(gotState.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(gotState.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await gotState.arrayBuffer())).toEqual(state);

    const gotKeybag = await ctx.handle(getRequest(ctx.channelId, 'keybag'));
    expectCors(gotKeybag);
    expect(gotKeybag.status).toBe(200);
    expect(gotKeybag.headers.get('ETag')).toBe(keybagEtag);
    expect(new Uint8Array(await gotKeybag.arrayBuffer())).toEqual(keybag);

    const next = new Uint8Array([0xca, 0xfe]);
    const putAgain = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, stateEtag, next));
    expect(putAgain.status).toBe(204);
    const nextEtag = putAgain.headers.get('ETag');
    expect(nextEtag).toMatch(/^"[^"]+"$/);
    expect(nextEtag).not.toBe(stateEtag);
    const gotNext = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(gotNext.headers.get('ETag')).toBe(nextEtag);
    expect(new Uint8Array(await gotNext.arrayBuffer())).toEqual(next);
  });

  it('returns 404 with CORS on an empty slot', async () => {
    const ctx = await minted();
    const res = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expectCors(res);
    expect(res.status).toBe(404);
  });

  it('rejects PUT without a token and with a wrong token', async () => {
    const ctx = await minted();
    const body = new Uint8Array([1]);

    const missing = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}/state`, {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          'If-Match': EMPTY_SLOT_ETAG,
          'Content-Length': '1',
          'Content-Type': 'application/octet-stream',
        },
        body,
      }),
    );
    expectCors(missing);
    expect(missing.status).toBe(401);

    const wrong = await ctx.handle(putRequest(ctx.channelId, 'state', 'ab'.repeat(32), EMPTY_SLOT_ETAG, body));
    expectCors(wrong);
    expect(wrong.status).toBe(401);
  });

  it('returns 412 for a stale If-Match', async () => {
    const ctx = await minted();
    const first = new Uint8Array([1, 2, 3]);
    const stale = new Uint8Array([9, 9, 9]);
    const created = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, first));
    expect(created.status).toBe(204);
    const etag = created.headers.get('ETag');
    expect(etag).toBeTruthy();

    const res = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, stale));
    expectCors(res);
    expect(res.status).toBe(412);

    const stillStale = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"not-the-etag"', stale));
    expect(stillStale.status).toBe(412);

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(got.headers.get('ETag')).toBe(etag);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(first);
  });

  it('lets exactly one of two empty-slot PUTs succeed', async () => {
    const ctx = await minted();
    const bodyA = new Uint8Array([10, 11, 12]);
    const bodyB = new Uint8Array([20, 21, 22]);

    const [a, b] = await Promise.all([
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, bodyA)),
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, bodyB)),
    ]);

    const statuses = [a.status, b.status].sort((left, right) => left - right);
    expect(statuses).toEqual([204, 412]);
    const winner = a.status === 204 ? a : b;
    const loser = a.status === 412 ? a : b;
    expectCors(winner);
    expectCors(loser);
    expect(winner.headers.get('ETag')).toMatch(/^"[^"]+"$/);

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(got.status).toBe(200);
    const bytes = Buffer.from(await got.arrayBuffer());
    expect(bytes.equals(Buffer.from(bodyA)) || bytes.equals(Buffer.from(bodyB))).toBe(true);
  });

  it('lets exactly one of two same-etag overwrites succeed', async () => {
    const ctx = await minted();
    const first = await ctx.handle(
      putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1])),
    );
    expect(first.status).toBe(204);
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const bodyA = new Uint8Array([10, 11, 12]);
    const bodyB = new Uint8Array([20, 21, 22]);
    const [a, b] = await Promise.all([
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, etag, bodyA)),
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, etag, bodyB)),
    ]);

    const statuses = [a.status, b.status].sort((left, right) => left - right);
    expect(statuses).toEqual([204, 412]);
    const winner = a.status === 204 ? a : b;
    expect(winner.headers.get('ETag')).toMatch(/^"[^"]+"$/);
    expect(winner.headers.get('ETag')).not.toBe(etag);

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(got.status).toBe(200);
    const bytes = Buffer.from(await got.arrayBuffer());
    expect(bytes.equals(Buffer.from(bodyA)) || bytes.equals(Buffer.from(bodyB))).toBe(true);
    expect(got.headers.get('ETag')).toBe(winner.headers.get('ETag'));
  });

  it('rejects PUT with no If-Match', async () => {
    const ctx = await minted();
    const res = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, null, new Uint8Array([1])));
    expectCors(res);
    expect(res.status).toBe(428);
  });

  it('rejects a weak If-Match', async () => {
    const ctx = await minted();
    const res = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, 'W/"1"', new Uint8Array([1])));
    expectCors(res);
    expect(res.status).toBe(400);
  });

  it('rejects oversize PUT before reading the body', async () => {
    const ctx = await minted();
    const res = await ctx.handle(
      guardedRequest(`http://relay.test/c/${ctx.channelId}/state`, {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          Authorization: `Bearer ${ctx.writeToken}`,
          'If-Match': EMPTY_SLOT_ETAG,
          'Content-Length': String(MAX_BODY_BYTES + 1),
          'Content-Type': 'application/octet-stream',
        },
      }),
    );
    expectCors(res);
    expect(res.status).toBe(413);
  });

  it('rejects an invalid slot', async () => {
    const ctx = await minted();
    const res = await ctx.handle(putRequest(ctx.channelId, 'notes', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1])));
    expectCors(res);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown channel', async () => {
    const ctx = await minted();
    const missing = 'ab'.repeat(16);
    const got = await ctx.handle(getRequest(missing, 'state'));
    expectCors(got);
    expect(got.status).toBe(404);

    const put = await ctx.handle(putRequest(missing, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1])));
    expectCors(put);
    expect(put.status).toBe(404);
  });

  it('DELETE removes both slots and requires the token', async () => {
    const ctx = await minted();
    expect(
      (await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1]))))
        .status,
    ).toBe(204);
    expect(
      (await ctx.handle(putRequest(ctx.channelId, 'keybag', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([2]))))
        .status,
    ).toBe(204);

    const denied = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN },
      }),
    );
    expectCors(denied);
    expect(denied.status).toBe(401);

    const wrong = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Authorization: 'Bearer deadbeef' },
      }),
    );
    expectCors(wrong);
    expect(wrong.status).toBe(401);

    const gone = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${ctx.writeToken}` },
      }),
    );
    expectCors(gone);
    expect(gone.status).toBe(204);

    expect((await ctx.handle(getRequest(ctx.channelId, 'state'))).status).toBe(404);
    expect((await ctx.handle(getRequest(ctx.channelId, 'keybag'))).status).toBe(404);
  });

  it('adds CORS headers to OPTIONS, 401, 404 and 412', async () => {
    const ctx = await minted();
    const preflight = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}/state`, {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'authorization,content-type,if-match',
        },
      }),
    );
    expectCors(preflight);
    expect(preflight.status).toBe(204);

    const unauthorized = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(unauthorized.status).toBe(404);
    expectCors(unauthorized);

    const noToken = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}/state`, {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          'If-Match': EMPTY_SLOT_ETAG,
          'Content-Length': '1',
        },
        body: new Uint8Array([1]),
      }),
    );
    expect(noToken.status).toBe(401);
    expectCors(noToken);

    expect(
      (await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1]))))
        .status,
    ).toBe(204);
    const stale = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([2])));
    expect(stale.status).toBe(412);
    expectCors(stale);
  });

  it('treats an expired channel as gone', async () => {
    let now = 1_000_000;
    const ctx = await minted(() => now);
    expect(
      (await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([1]))))
        .status,
    ).toBe(204);

    now += CHANNEL_TTL_MS;
    const expired = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(expired.status).toBe(404);

    const put = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([2])));
    expect(put.status).toBe(404);
  });

  it('accepts the /api prefix Vercel serves', async () => {
    const ctx = await minted();
    const mintedOnApi = await ctx.handle(
      new Request('http://relay.test/api/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    expect(mintedOnApi.status).toBe(201);
    const body = (await mintedOnApi.json()) as { channelId: string; writeToken: string };
    const put = await ctx.handle(
      putRequest(body.channelId, 'state', body.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([7]), '/api'),
    );
    expect(put.status).toBe(204);
    const got = await ctx.handle(
      new Request(`http://relay.test/api/c/${body.channelId}/state`, {
        method: 'GET',
        headers: { Origin: ORIGIN },
      }),
    );
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array([7]));
  });

  it('mints and reads through a rewritten /api URL', async () => {
    const ctx = await minted();
    const mintedOnRewrite = await ctx.handle(
      new Request('http://relay.test/api?__path=/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    expect(mintedOnRewrite.status).toBe(201);
    const body = (await mintedOnRewrite.json()) as { channelId: string; writeToken: string };
    const put = await ctx.handle(
      new Request(`http://relay.test/api?__path=/c/${body.channelId}/state`, {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          Authorization: `Bearer ${body.writeToken}`,
          'If-Match': EMPTY_SLOT_ETAG,
          'Content-Type': 'application/octet-stream',
          'Content-Length': '1',
        },
        body: new Uint8Array([9]),
      }),
    );
    expect(put.status).toBe(204);
    const got = await ctx.handle(
      new Request(`http://relay.test/api?id=${body.channelId}&slot=state`, {
        method: 'GET',
        headers: { Origin: ORIGIN },
      }),
    );
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array([9]));
  });

  it('returns a generic 500 and logs a redacted cause when the store throws', async () => {
    const channelId = 'ab'.repeat(16);
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    const handle = createHandler({
      async get() {
        throw new Error('blob read failed', {
          cause: new Error(`Vercel Blob: missing token for c/${channelId}/state`),
        });
      },
      async put() {
        throw new Error('unused');
      },
      async del() {},
      async list() {
        return [];
      },
    });

    const res = await handle(
      new Request(`http://relay.test/c/${channelId}/state`, {
        method: 'GET',
        headers: { Origin: ORIGIN },
      }),
    );
    spy.mockRestore();

    expectCors(res);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    const text = logged.join('\n');
    expect(text).toContain('blob read failed');
    expect(text).toContain('missing token');
    expect(text).not.toContain(channelId);
  });

  it('does not store the write token in plaintext', async () => {
    const ctx = await minted();
    const listed = await ctx.store.list(`c/${ctx.channelId}/`);
    expect(listed).toHaveLength(1);
    const stored = await ctx.store.get(listed[0]!.key);
    expect(stored).not.toBeNull();
    expect(Buffer.from(stored!.body).equals(Buffer.from(ctx.writeToken))).toBe(false);
    const hashed = createHash('sha256').update(ctx.writeToken, 'utf8').digest();
    expect(Buffer.from(stored!.body).equals(hashed)).toBe(true);
  });

  it('mints a channel when the shared secret is presented', async () => {
    const handle = createHandler(new MemoryStore());
    const res = await handle(
      new Request('http://relay.test/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    expectCors(res);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { channelId: string; writeToken: string; error?: string };
    expect(body.channelId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.writeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(body.error).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(MINT_SECRET);
  });

  it('rejects mint with a wrong secret or a missing header', async () => {
    const handle = createHandler(new MemoryStore());

    const missing = await handle(
      new Request('http://relay.test/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN },
      }),
    );
    expectCors(missing);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'unauthorized' });

    const wrongSecret = 'definitely-not-the-mint-secret';
    const wrong = await handle(
      new Request('http://relay.test/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${wrongSecret}` },
      }),
    );
    expectCors(wrong);
    expect(wrong.status).toBe(401);
    const body = await wrong.json();
    expect(body).toEqual({ error: 'unauthorized' });
    expect(JSON.stringify(body)).not.toContain(wrongSecret);
    expect(JSON.stringify(body)).not.toContain(MINT_SECRET);
  });

  it('refuses to mint when RELAY_MINT_SECRET is unset or empty', async () => {
    const handle = createHandler(new MemoryStore());
    const presented = 'should-not-appear-in-logs-or-body';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const value of ['', '   '] as const) {
      vi.stubEnv('RELAY_MINT_SECRET', value);
      const res = await handle(
        new Request('http://relay.test/channel', {
          method: 'POST',
          headers: { Origin: ORIGIN, Authorization: `Bearer ${presented}` },
        }),
      );
      expectCors(res);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ error: 'minting unavailable' });
      expect(JSON.stringify(body)).not.toContain(presented);
    }

    vi.unstubAllEnvs();
    delete process.env.RELAY_MINT_SECRET;
    const unset = await handle(
      new Request('http://relay.test/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${presented}` },
      }),
    );
    expectCors(unset);
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: 'minting unavailable' });

    const logged = spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    spy.mockRestore();
    expect(logged).toContain('RELAY_MINT_SECRET');
    expect(logged).toContain('unset');
    expect(logged).not.toContain(presented);
  });

  it('does not gate GET, PUT or DELETE of an existing channel on the mint secret', async () => {
    const ctx = await minted();
    const payload = new Uint8Array([3, 1, 4]);

    const emptyGet = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expectCors(emptyGet);
    expect(emptyGet.status).toBe(404);

    const mintAsWrite = await ctx.handle(
      putRequest(ctx.channelId, 'state', MINT_SECRET, EMPTY_SLOT_ETAG, payload),
    );
    expectCors(mintAsWrite);
    expect(mintAsWrite.status).toBe(401);

    const put = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, EMPTY_SLOT_ETAG, payload));
    expectCors(put);
    expect(put.status).toBe(204);

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expectCors(got);
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(payload);

    const mintAsDelete = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    expectCors(mintAsDelete);
    expect(mintAsDelete.status).toBe(401);

    const gone = await ctx.handle(
      new Request(`http://relay.test/c/${ctx.channelId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${ctx.writeToken}` },
      }),
    );
    expectCors(gone);
    expect(gone.status).toBe(204);
    expect((await ctx.handle(getRequest(ctx.channelId, 'state'))).status).toBe(404);
  });
});

async function minted(now?: () => number) {
  const store = new MemoryStore(now);
  const handle = createHandler(store, { now });
  const res = await handle(
    new Request('http://relay.test/channel', {
      method: 'POST',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
    }),
  );
  expectCors(res);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { channelId: string; writeToken: string };
  expect(body.channelId).toMatch(/^[0-9a-f]{32}$/);
  expect(body.writeToken).toMatch(/^[0-9a-f]{64}$/);
  return { handle, store, channelId: body.channelId, writeToken: body.writeToken };
}

function getRequest(id: string, slot: string): Request {
  return new Request(`http://relay.test/c/${id}/${slot}`, {
    method: 'GET',
    headers: { Origin: ORIGIN },
  });
}

function putRequest(
  id: string,
  slot: string,
  token: string,
  ifMatch: string | null,
  body: Uint8Array,
  prefix = '',
): Request {
  const headers: Record<string, string> = {
    Origin: ORIGIN,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(body.byteLength),
  };
  if (ifMatch !== null) headers['If-Match'] = ifMatch;
  return new Request(`http://relay.test${prefix}/c/${id}/${slot}`, {
    method: 'PUT',
    headers,
    body,
  });
}

function expectCors(res: Response, origin = ORIGIN): void {
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization');
  expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('if-match');
  expect(res.headers.get('Access-Control-Expose-Headers')).toMatch(/ETag/i);
  expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
}

function guardedRequest(url: string, init: RequestInit): Request {
  const inner = new Request(url, init);
  const blocked = async () => {
    throw new Error('body was buffered');
  };
  return {
    get method() {
      return inner.method;
    },
    get url() {
      return inner.url;
    },
    get headers() {
      return inner.headers;
    },
    arrayBuffer: blocked,
    text: blocked,
    json: blocked,
    blob: blocked,
    formData: blocked,
    get body() {
      throw new Error('body was buffered');
    },
  } as unknown as Request;
}
