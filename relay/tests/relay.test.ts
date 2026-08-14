import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CHANNEL_TTL_MS, MAX_BODY_BYTES, createHandler } from '../src/relay';
import { MemoryStore } from '../src/store';

const ORIGIN = 'https://app.example';

describe('relay', () => {
  it('mints a channel and round-trips PUT/GET on both slots', async () => {
    const ctx = await minted();
    const state = new Uint8Array([0xde, 0xad, 0x01]);
    const keybag = new Uint8Array([0xbe, 0xef, 0x02]);

    const putState = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', state));
    expectCors(putState);
    expect(putState.status).toBe(204);
    expect(putState.headers.get('ETag')).toBe('"1"');

    const putKeybag = await ctx.handle(putRequest(ctx.channelId, 'keybag', ctx.writeToken, '"0"', keybag));
    expectCors(putKeybag);
    expect(putKeybag.status).toBe(204);
    expect(putKeybag.headers.get('ETag')).toBe('"1"');

    const gotState = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expectCors(gotState);
    expect(gotState.status).toBe(200);
    expect(gotState.headers.get('ETag')).toBe('"1"');
    expect(gotState.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(new Uint8Array(await gotState.arrayBuffer())).toEqual(state);

    const gotKeybag = await ctx.handle(getRequest(ctx.channelId, 'keybag'));
    expectCors(gotKeybag);
    expect(gotKeybag.status).toBe(200);
    expect(gotKeybag.headers.get('ETag')).toBe('"1"');
    expect(new Uint8Array(await gotKeybag.arrayBuffer())).toEqual(keybag);

    const next = new Uint8Array([0xca, 0xfe]);
    const putAgain = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"1"', next));
    expect(putAgain.status).toBe(204);
    expect(putAgain.headers.get('ETag')).toBe('"2"');
    const gotNext = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(gotNext.headers.get('ETag')).toBe('"2"');
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
          'If-Match': '"0"',
          'Content-Length': '1',
          'Content-Type': 'application/octet-stream',
        },
        body,
      }),
    );
    expectCors(missing);
    expect(missing.status).toBe(401);

    const wrong = await ctx.handle(putRequest(ctx.channelId, 'state', 'ab'.repeat(32), '"0"', body));
    expectCors(wrong);
    expect(wrong.status).toBe(401);
  });

  it('returns 412 for a stale If-Match', async () => {
    const ctx = await minted();
    const first = new Uint8Array([1, 2, 3]);
    const stale = new Uint8Array([9, 9, 9]);
    expect((await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', first))).status).toBe(204);

    const res = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', stale));
    expectCors(res);
    expect(res.status).toBe(412);

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(first);
  });

  it('lets exactly one of two same-generation PUTs succeed', async () => {
    const ctx = await minted();
    const bodyA = new Uint8Array([10, 11, 12]);
    const bodyB = new Uint8Array([20, 21, 22]);

    const [a, b] = await Promise.all([
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', bodyA)),
      ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', bodyB)),
    ]);

    const statuses = [a.status, b.status].sort((left, right) => left - right);
    expect(statuses).toEqual([204, 412]);
    const winner = a.status === 204 ? a : b;
    const loser = a.status === 412 ? a : b;
    expectCors(winner);
    expectCors(loser);
    expect(winner.headers.get('ETag')).toBe('"1"');

    const got = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(got.status).toBe(200);
    const bytes = Buffer.from(await got.arrayBuffer());
    expect(bytes.equals(Buffer.from(bodyA)) || bytes.equals(Buffer.from(bodyB))).toBe(true);
  });

  it('rejects PUT with no If-Match', async () => {
    const ctx = await minted();
    const res = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, null, new Uint8Array([1])));
    expectCors(res);
    expect(res.status).toBe(428);
  });

  it('rejects oversize PUT before reading the body', async () => {
    const ctx = await minted();
    const res = await ctx.handle(
      guardedRequest(`http://relay.test/c/${ctx.channelId}/state`, {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          Authorization: `Bearer ${ctx.writeToken}`,
          'If-Match': '"0"',
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
    const res = await ctx.handle(putRequest(ctx.channelId, 'notes', ctx.writeToken, '"0"', new Uint8Array([1])));
    expectCors(res);
    expect(res.status).toBe(400);
  });

  it('DELETE removes both slots and requires the token', async () => {
    const ctx = await minted();
    expect((await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', new Uint8Array([1])))).status).toBe(204);
    expect((await ctx.handle(putRequest(ctx.channelId, 'keybag', ctx.writeToken, '"0"', new Uint8Array([2])))).status).toBe(204);

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
          'If-Match': '"0"',
          'Content-Length': '1',
        },
        body: new Uint8Array([1]),
      }),
    );
    expect(noToken.status).toBe(401);
    expectCors(noToken);

    expect((await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', new Uint8Array([1])))).status).toBe(204);
    const stale = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', new Uint8Array([2])));
    expect(stale.status).toBe(412);
    expectCors(stale);
  });

  it('treats an expired channel as gone', async () => {
    let now = 1_000_000;
    const ctx = await minted(() => now);
    expect((await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', new Uint8Array([1])))).status).toBe(204);

    now += CHANNEL_TTL_MS;
    const expired = await ctx.handle(getRequest(ctx.channelId, 'state'));
    expect(expired.status).toBe(404);

    const put = await ctx.handle(putRequest(ctx.channelId, 'state', ctx.writeToken, '"0"', new Uint8Array([2])));
    expect(put.status).toBe(404);
  });

  it('accepts the /api prefix Vercel serves', async () => {
    const ctx = await minted();
    const mintedOnApi = await ctx.handle(
      new Request('http://relay.test/api/channel', {
        method: 'POST',
        headers: { Origin: ORIGIN },
      }),
    );
    expect(mintedOnApi.status).toBe(201);
    const body = (await mintedOnApi.json()) as { channelId: string; writeToken: string };
    const put = await ctx.handle(
      putRequest(body.channelId, 'state', body.writeToken, '"0"', new Uint8Array([7]), '/api'),
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
});

async function minted(now?: () => number) {
  const store = new MemoryStore(now);
  const handle = createHandler(store, { now });
  const res = await handle(
    new Request('http://relay.test/channel', {
      method: 'POST',
      headers: { Origin: ORIGIN },
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
