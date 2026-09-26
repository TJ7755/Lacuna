import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SLOT_ETAG,
  SHARE_META_MAX_BYTES,
  SHARE_PAYLOAD_MAX_BYTES,
  __resetMintRateLimitForTests,
  __resetShareMintRateLimitForTests,
  createHandler,
} from '../src/relay.js';
import { cleanupExpiredShares } from '../src/shares.js';
import { MemoryStore } from '../src/store.js';

const ORIGIN = 'https://app.example';
const MINT_SECRET = 'test-relay-mint-secret';

beforeEach(() => {
  vi.stubEnv('RELAY_MINT_SECRET', MINT_SECRET);
  __resetMintRateLimitForTests();
  __resetShareMintRateLimitForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMintRateLimitForTests();
  __resetShareMintRateLimitForTests();
});

describe('course share links', () => {
  it('mints a share and round-trips PUT/GET on payload and meta slots', async () => {
    const ctx = await mintedShare();
    const payload = new TextEncoder().encode('{"format":"lacuna-course"}');
    const meta = new TextEncoder().encode('{"revision":2}');

    const putPayload = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, payload),
    );
    expectCors(putPayload);
    expect(putPayload.status).toBe(204);
    const payloadEtag = putPayload.headers.get('ETag');
    expect(payloadEtag).toMatch(/^"[^"]+"$/);

    const putMeta = await ctx.handle(
      putShareRequest(ctx.shareId, 'meta', ctx.writeToken, EMPTY_SLOT_ETAG, meta),
    );
    expectCors(putMeta);
    expect(putMeta.status).toBe(204);

    const gotPayload = await ctx.handle(getShareRequest(ctx.shareId, 'payload'));
    expectCors(gotPayload);
    expect(gotPayload.status).toBe(200);
    expect(gotPayload.headers.get('ETag')).toBe(payloadEtag);
    expect(gotPayload.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(gotPayload.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await gotPayload.arrayBuffer())).toEqual(payload);

    const gotMeta = await ctx.handle(getShareRequest(ctx.shareId, 'meta'));
    expectCors(gotMeta);
    expect(gotMeta.status).toBe(200);
    expect(new Uint8Array(await gotMeta.arrayBuffer())).toEqual(meta);

    const revised = new TextEncoder().encode('{"format":"lacuna-course","revision":3}');
    const putAgain = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, payloadEtag, revised),
    );
    expect(putAgain.status).toBe(204);
    const nextEtag = putAgain.headers.get('ETag');
    expect(nextEtag).not.toBe(payloadEtag);
    const gotNext = await ctx.handle(getShareRequest(ctx.shareId, 'payload'));
    expect(gotNext.headers.get('ETag')).toBe(nextEtag);
    expect(new Uint8Array(await gotNext.arrayBuffer())).toEqual(revised);
  });

  it('returns 404 with CORS on an empty payload slot', async () => {
    const ctx = await mintedShare();
    const res = await ctx.handle(getShareRequest(ctx.shareId, 'payload'));
    expectCors(res);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed share id', async () => {
    const ctx = await mintedShare();
    const res = await ctx.handle(getShareRequest('not-a-share-id', 'payload'));
    expect(res.status).toBe(404);
    expect(await ctx.handle(getShareRequest(`${ctx.shareId}zz`, 'payload')).then((r) => r.status)).toBe(
      404,
    );
  });

  it('rejects unknown slots', async () => {
    const ctx = await mintedShare();
    const res = await ctx.handle(getShareRequest(ctx.shareId, 'notes'));
    expect(res.status).toBe(400);
  });

  it('rejects PUT without a token and with a wrong token', async () => {
    const ctx = await mintedShare();
    const body = new Uint8Array([1]);

    const missing = await ctx.handle(
      new Request(`http://relay.test/shares/${ctx.shareId}/payload`, {
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

    const wrong = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', 'ab'.repeat(32), EMPTY_SLOT_ETAG, body),
    );
    expectCors(wrong);
    expect(wrong.status).toBe(401);
  });

  it('returns 412 for a stale If-Match', async () => {
    const ctx = await mintedShare();
    const first = new Uint8Array([1, 2, 3]);
    const created = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, first),
    );
    expect(created.status).toBe(204);
    const etag = created.headers.get('ETag');
    expect(etag).toBeTruthy();

    const stale = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, new Uint8Array([9])),
    );
    expectCors(stale);
    expect(stale.status).toBe(412);
  });

  it('requires If-Match on PUT', async () => {
    const ctx = await mintedShare();
    const res = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, null, new Uint8Array([1])),
    );
    expect(res.status).toBe(428);
  });

  it('refuses an oversized payload with a share-specific message', async () => {
    const ctx = await mintedShare();
    const oversized = new Uint8Array(SHARE_PAYLOAD_MAX_BYTES + 1);
    const res = await ctx.handle(
      putShareRequest(ctx.shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, oversized),
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/course file/i);
  });

  it('refuses an oversized manifest', async () => {
    const ctx = await mintedShare();
    const oversized = new Uint8Array(SHARE_META_MAX_BYTES + 1);
    const res = await ctx.handle(
      putShareRequest(ctx.shareId, 'meta', ctx.writeToken, EMPTY_SLOT_ETAG, oversized),
    );
    expect(res.status).toBe(413);
  });

  it('deletes the whole share group with the write token', async () => {
    const ctx = await mintedShare();
    const payload = new Uint8Array([7]);
    const meta = new Uint8Array([8]);
    expect(
      (
        await ctx.handle(
          putShareRequest(ctx.shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, payload),
        )
      ).status,
    ).toBe(204);
    expect(
      (await ctx.handle(putShareRequest(ctx.shareId, 'meta', ctx.writeToken, EMPTY_SLOT_ETAG, meta)))
        .status,
    ).toBe(204);

    const gone = await ctx.handle(
      new Request(`http://relay.test/shares/${ctx.shareId}`, {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${ctx.writeToken}` },
      }),
    );
    expectCors(gone);
    expect(gone.status).toBe(204);
    expect((await ctx.handle(getShareRequest(ctx.shareId, 'payload'))).status).toBe(404);
    expect((await ctx.handle(getShareRequest(ctx.shareId, 'meta'))).status).toBe(404);
  });

  it('rate-limits public share minting per IP', async () => {
    vi.stubEnv('RELAY_MINT_SECRET', MINT_SECRET);
    const store = new MemoryStore();
    const handle = createHandler(store);
    const mint = () =>
      handle(
        new Request('http://relay.test/shares', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'x-forwarded-for': '198.51.100.9' },
        }),
      );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await mint()).status).toBe(201);
    }
    const limited = await mint();
    expect(limited.status).toBe(429);
  });

  it('sweeps shares untouched past the TTL plus grace', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    const minted = await handle(
      new Request('http://relay.test/shares', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    expect(minted.status).toBe(201);
    const { shareId, writeToken } = (await minted.json()) as {
      shareId: string;
      writeToken: string;
    };
    const payload = new Uint8Array([1, 2]);
    expect(
      (
        await handle(putShareRequest(shareId, 'payload', writeToken, EMPTY_SLOT_ETAG, payload))
      ).status,
    ).toBe(204);

    now += 91 * 24 * 60 * 60 * 1000;
    const result = await cleanupExpiredShares(store, now);
    expect(result).toEqual({ sharesDeleted: 1, shareObjectsDeleted: 2 });
    expect((await handle(getShareRequest(shareId, 'payload'))).status).toBe(404);
  });

  it('keeps a share refreshed within the TTL', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    const minted = await handle(
      new Request('http://relay.test/shares', {
        method: 'POST',
        headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
      }),
    );
    const { shareId } = (await minted.json()) as { shareId: string; writeToken: string };

    now += 89 * 24 * 60 * 60 * 1000;
    const result = await cleanupExpiredShares(store, now);
    expect(result).toEqual({ sharesDeleted: 0, shareObjectsDeleted: 0 });
    expect((await handle(getShareRequest(shareId, 'payload'))).status).toBe(404);
  });
});

async function mintedShare() {
  const store = new MemoryStore();
  const handle = createHandler(store);
  const res = await handle(
    new Request('http://relay.test/shares', {
      method: 'POST',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
    }),
  );
  expectCors(res);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { shareId: string; writeToken: string };
  expect(body.shareId).toMatch(/^[0-9a-f]{32}$/);
  expect(body.writeToken).toMatch(/^[0-9a-f]{64}$/);
  return { handle, store, shareId: body.shareId, writeToken: body.writeToken };
}

function getShareRequest(id: string, slot: string): Request {
  return new Request(`http://relay.test/shares/${id}/${slot}`, {
    method: 'GET',
    headers: { Origin: ORIGIN },
  });
}

function putShareRequest(
  id: string,
  slot: string,
  token: string,
  ifMatch: string | null,
  body: Uint8Array,
): Request {
  const headers: Record<string, string> = {
    Origin: ORIGIN,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(body.byteLength),
  };
  if (ifMatch !== null) headers['If-Match'] = ifMatch;
  return new Request(`http://relay.test/shares/${id}/${slot}`, {
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
