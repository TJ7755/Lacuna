import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SLOT_ETAG,
  SHARE_META_MAX_BYTES,
  SHARE_PAYLOAD_MAX_BYTES,
  createHandler,
} from '../src/relay.js';
import { cleanupExpiredShares } from '../src/shares.js';
import { CHANNEL_TTL_MS, CHANNEL_CLEANUP_GRACE_MS } from '../src/channelMaintenance.js';
import { MemoryStore, type PutOptions } from '../src/store.js';

const ORIGIN = 'https://getlacuna.app';
const MINT_SECRET = 'test-relay-mint-secret';

beforeEach(() => {
  vi.stubEnv('RELAY_MINT_SECRET', MINT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('course share links', () => {
  it.each([
    '6fb10671c70197caeff8616f80697ac5',
    'daf16de2b88b97fa236948559ede6c4c',
    '52fe58acd2fcece40c1d10ffbf08276f',
    '31178fee8489ffcf1748c1dc5c570be5',
    '9a44358aa0d59d1f1fbd02b30c38b746',
    '40aab20ad7ab21811e1059b47522cc3a',
    'e0da40253700207827f2b26455bd9ed6',
    '819c37db9ae88c45631f51348b7b44f2',
    '40d06cbdd6fc0170da1faa1e1192e3fb',
    '6f78a8e5f86fd26bf5be39ff96a13733',
    '4e756f914aea44bfe8312b2e9cb83843',
    '6d31d711f32f4c3ee59884e86d2a7d7f',
    'f59cf55a906edfede13902ca7bfda358',
    '79c53406f469e40ec6949746d6879167',
    '6ab9bb362064a8f661737b11b634b6d1',
    'b9079bf89fcc37a4dfaa4f665c8ea236',
    '96fbd96735ce0d4efe7d05675eb6cb72',
    'c93779cc47d65de9af9fd421914b06bb',
    '405b448b4804d48c3bd80a4d3ccfd85d',
    'ae447daf5e1b587fd7e725dd1db8ec27',
    'e8bdbfc18b3270faa77cc341e876bf26',
    'b01c1050191588212cff4cc28131fa10',
    '91edc6fda3742ffe8ce963c3ae848e41',
    'e85fc39e709074d58669c2d8bfd723bb',
    '5459ed1b6b0ca5ac7e646b68f17d1732',
    '3fa2fa48f570b5bfdd6e859a9df25e47',
  ])('keeps unchanged official publication %s beyond 90 days without writes', async (shareId) => {
    let now = 0;
    const store = new MemoryStore(() => now);
    const ctx = await mintedShare(store, () => now);
    const auth = (await store.get(`shares/${ctx.shareId}/auth`))!;
    await store.put(`shares/${shareId}/auth`, auth.body, { exclusive: true });
    await store.del([`shares/${ctx.shareId}/auth`]);
    const payload = new TextEncoder().encode('unchanged approved course');
    expect(
      (
        await ctx.handle(
          putShareRequest(shareId, 'payload', ctx.writeToken, EMPTY_SLOT_ETAG, payload),
        )
      ).status,
    ).toBe(204);
    const before = await store.get(`shares/${shareId}/payload`);
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1;
    expect((await ctx.handle(getShareRequest(shareId, 'payload'))).status).toBe(200);
    expect(await cleanupExpiredShares(store, now)).toEqual({
      sharesDeleted: 0,
      shareObjectsDeleted: 0,
    });
    expect(await store.get(`shares/${shareId}/payload`)).toEqual(before);
    expect(
      (
        await ctx.handle(
          new Request(`http://relay.test/shares/${shareId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer wrong' },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await ctx.handle(
          new Request(`http://relay.test/shares/${shareId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${ctx.writeToken}` },
          }),
        )
      ).status,
    ).toBe(204);
    expect((await ctx.handle(getShareRequest(shareId, 'payload'))).status).toBe(404);
    expect(await store.list(`shares/${shareId}/`)).toHaveLength(0);
  });

  it.each(['auth', 'payload'] as const)(
    'cleans up an official publication missing its %s without resurrecting it',
    async (missing) => {
      let now = 0;
      const store = new MemoryStore(() => now);
      const shareId = '6fb10671c70197caeff8616f80697ac5';
      const remaining = missing === 'auth' ? 'payload' : 'auth';
      await store.put(`shares/${shareId}/${remaining}`, new Uint8Array([1]), { exclusive: true });
      now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1;
      const handle = createHandler(store, { now: () => now });
      expect((await handle(getShareRequest(shareId, 'payload'))).status).toBe(404);
      expect(await cleanupExpiredShares(store, now)).toEqual({
        sharesDeleted: 1,
        shareObjectsDeleted: 1,
      });
      expect(await store.list(`shares/${shareId}/`)).toHaveLength(0);
    },
  );

  it('does not let a public request make an ordinary share permanent', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    const ctx = await mintedShare(store, () => now);
    const request = putShareRequest(
      ctx.shareId,
      'payload',
      ctx.writeToken,
      EMPTY_SLOT_ETAG,
      new TextEncoder().encode('{"persistent":true}'),
    );
    request.headers.set('X-Lacuna-Persistent', 'true');
    expect((await ctx.handle(request)).status).toBe(204);
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS + 1;
    expect((await ctx.handle(getShareRequest(ctx.shareId, 'payload'))).status).toBe(404);
    expect(await cleanupExpiredShares(store, now)).toEqual({
      sharesDeleted: 1,
      shareObjectsDeleted: 2,
    });
  });

  it.each([
    ['meta', false],
    ['payload', false],
    ['teacher', false],
    ['meta', true],
    ['payload', true],
  ] as const)(
    'reads only the requested %s body, once, without downloading other slots (linked: %s)',
    async (slot, linked) => {
      const ctx = await mintedShare();
      const bodies = {
        payload: new Uint8Array(1_928_490).fill(7),
        meta: new TextEncoder().encode('{}'),
        teacher: new Uint8Array([1, 2, 3]),
      };
      let expectedEtag = '';
      for (const name of ['payload', 'meta', 'teacher'] as const) {
        const written = await ctx.handle(
          putShareRequest(ctx.shareId, name, ctx.writeToken, EMPTY_SLOT_ETAG, bodies[name]),
        );
        expect(written.status).toBe(204);
        if (name === slot) expectedEtag = written.headers.get('ETag')!;
      }
      let requestedId = ctx.shareId;
      if (linked) {
        const minted = await ctx.handle(
          new Request('http://relay.test/shares', {
            method: 'POST',
            headers: { Authorization: `Bearer ${MINT_SECRET}` },
            body: JSON.stringify({ sourceShareId: ctx.shareId }),
          }),
        );
        expect(minted.status).toBe(201);
        requestedId = ((await minted.json()) as { shareId: string }).shareId;
      }
      const get = ctx.store.get.bind(ctx.store);
      let bodyBytesRead = 0;
      vi.spyOn(ctx.store, 'get').mockImplementation(async (key) => {
        const stored = await get(key);
        // Linked reads need the immutable source id, never its other bodies.
        if (!key.endsWith('/source')) bodyBytesRead += stored?.body.byteLength ?? 0;
        return stored;
      });

      const response = await ctx.handle(getShareRequest(requestedId, slot));
      expect(response.status).toBe(200);
      expectCors(response);
      expect(response.headers.get('ETag')).toBe(expectedEtag);
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(Buffer.from(await response.arrayBuffer()).equals(bodies[slot])).toBe(true);
      expect(bodyBytesRead).toBe(bodies[slot].byteLength);
    },
  );

  it.each(['payload', 'meta', 'teacher', 'class-code'])(
    'expires from the latest %s write rather than the original auth upload',
    async (slot) => {
      let now = 0;
      const ctx = await mintedShare(new MemoryStore(() => now), () => now);
      await ctx.store.put(`shares/${ctx.shareId}/meta`, new TextEncoder().encode('{}'), {
        exclusive: true,
      });
      now = CHANNEL_TTL_MS - 1;
      await ctx.store.put(`shares/${ctx.shareId}/${slot}`, new TextEncoder().encode('{}'), {
        overwrite: true,
      });
      const get = ctx.store.get.bind(ctx.store);
      let bodyBytesRead = 0;
      vi.spyOn(ctx.store, 'get').mockImplementation(async (key) => {
        const stored = await get(key);
        bodyBytesRead += stored?.body.byteLength ?? 0;
        return stored;
      });
      now = CHANNEL_TTL_MS;
      expect((await ctx.handle(getShareRequest(ctx.shareId, 'meta'))).status).toBe(200);
      expect(bodyBytesRead).toBe(2);
      now = 2 * CHANNEL_TTL_MS - 1;
      bodyBytesRead = 0;
      const expired = await ctx.handle(getShareRequest(ctx.shareId, 'meta'));
      expect(expired.status).toBe(404);
      expect(await expired.json()).toEqual({ error: 'not found' });
      expect(bodyBytesRead).toBe(0);
    },
  );

  it.each(['missing auth', 'auth deleted during liveness', 'payload deleted during liveness'])(
    'does not serve orphaned or missing payload bytes with %s',
    async (race) => {
      const ctx = await mintedShare();
      const prefix = `shares/${ctx.shareId}/`;
      await ctx.store.put(`${prefix}payload`, new Uint8Array(1_928_490), { exclusive: true });
      if (race === 'missing auth') await ctx.store.del([`${prefix}auth`]);
      const stat = ctx.store.stat.bind(ctx.store);
      vi.spyOn(ctx.store, 'stat').mockImplementation(async (key) => {
        const metadata = await stat(key);
        if (key === `${prefix}payload` && race !== 'missing auth') {
          await ctx.store.del([`${prefix}${race.startsWith('auth') ? 'auth' : 'payload'}`]);
        }
        return metadata;
      });
      const get = ctx.store.get.bind(ctx.store);
      let bodyBytesRead = 0;
      vi.spyOn(ctx.store, 'get').mockImplementation(async (key) => {
        const stored = await get(key);
        bodyBytesRead += stored?.body.byteLength ?? 0;
        return stored;
      });
      const response = await ctx.handle(getShareRequest(ctx.shareId, 'payload'));
      expectCors(response);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not found' });
      expect(bodyBytesRead).toBe(0);
    },
  );

  it.each(['after listing', 'after the first stat', 'after the known-key recheck'])(
    'retains a share refreshed %s during cleanup',
    async (race) => {
      let now = 0;
      const ctx = await mintedShare(new MemoryStore(() => now), () => now);
      const prefix = `shares/${ctx.shareId}/`;
      await ctx.store.put(`${prefix}payload`, new Uint8Array(1_928_490), { exclusive: true });
      now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS;
      const list = ctx.store.list.bind(ctx.store);
      vi.spyOn(ctx.store, 'list').mockImplementation(async (key) => {
        const objects = await list(key);
        if (key === prefix && race === 'after listing') {
          await ctx.store.put(`${prefix}meta`, new TextEncoder().encode('{}'), { exclusive: true });
        }
        return objects;
      });
      const stat = ctx.store.stat.bind(ctx.store);
      let payloadStats = 0;
      vi.spyOn(ctx.store, 'stat').mockImplementation(async (key) => {
        const metadata = await stat(key);
        if (key === `${prefix}payload`) {
          payloadStats += 1;
          const refreshOn = race === 'after the first stat' ? 1 : 2;
          if (race !== 'after listing' && payloadStats === refreshOn) {
            await ctx.store.put(key, new Uint8Array([9]), { overwrite: true });
          }
        }
        return metadata;
      });
      const del = vi.spyOn(ctx.store, 'del');
      expect(await cleanupExpiredShares(ctx.store, now)).toEqual({
        sharesDeleted: 0,
        shareObjectsDeleted: 0,
      });
      expect(del).not.toHaveBeenCalled();
      expect((await ctx.handle(getShareRequest(ctx.shareId, 'payload'))).status).toBe(200);
    },
  );

  it('applies owner authentication, compare-and-swap and size limits to the public teacher slot', async () => {
    const ctx = await mintedShare();
    const bytes = new TextEncoder().encode('{"v":1,"recipient":"public-only"}');
    expect(
      (await ctx.handle(putShareRequest(ctx.shareId, 'teacher', 'wrong', EMPTY_SLOT_ETAG, bytes)))
        .status,
    ).toBe(401);
    const published = await ctx.handle(
      putShareRequest(ctx.shareId, 'teacher', ctx.writeToken, EMPTY_SLOT_ETAG, bytes),
    );
    expect(published.status).toBe(204);
    expect(
      (
        await ctx.handle(
          putShareRequest(ctx.shareId, 'teacher', ctx.writeToken, EMPTY_SLOT_ETAG, bytes),
        )
      ).status,
    ).toBe(412);
    const read = await ctx.handle(getShareRequest(ctx.shareId, 'teacher'));
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
    expect(
      (
        await ctx.handle(
          putShareRequest(
            ctx.shareId,
            'teacher',
            ctx.writeToken,
            published.headers.get('ETag'),
            new Uint8Array(SHARE_META_MAX_BYTES + 1),
          ),
        )
      ).status,
    ).toBe(413);
    const removed = await ctx.handle(
      new Request(`http://relay.test/shares/${ctx.shareId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ctx.writeToken}` },
      }),
    );
    expect(removed.status).toBe(204);
    expect(await ctx.store.get(`shares/${ctx.shareId}/teacher`)).toBeNull();
  });
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
    expect(
      await ctx.handle(getShareRequest(`${ctx.shareId}zz`, 'payload')).then((r) => r.status),
    ).toBe(404);
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
      (
        await ctx.handle(
          putShareRequest(ctx.shareId, 'meta', ctx.writeToken, EMPTY_SLOT_ETAG, meta),
        )
      ).status,
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

  it.each([false, true])(
    'revokes a share deleted mid-upload without readable orphans (official: %s)',
    async (official) => {
      const store = new ShareUploadRaceStore();
      const handle = createHandler(store);
      const minted = await handle(
        new Request('http://relay.test/shares', {
          method: 'POST',
          headers: { Origin: ORIGIN, Authorization: `Bearer ${MINT_SECRET}` },
        }),
      );
      expect(minted.status).toBe(201);
      const { shareId: mintedId, writeToken } = (await minted.json()) as {
        shareId: string;
        writeToken: string;
      };

      const shareId = official ? '6fb10671c70197caeff8616f80697ac5' : mintedId;
      if (official) {
        const auth = (await store.get(`shares/${mintedId}/auth`))!;
        await store.put(`shares/${shareId}/auth`, auth.body, { exclusive: true });
        await store.del([`shares/${mintedId}/auth`]);
      }

      let releasePut!: () => void;
      let putEnteredResolve!: () => void;
      const putEntered = new Promise<void>((resolve) => {
        putEnteredResolve = resolve;
      });
      const putReleased = new Promise<void>((resolve) => {
        releasePut = resolve;
      });
      store.gatePayloadPut(async () => {
        putEnteredResolve();
        await putReleased;
      });

      const payload = new TextEncoder().encode('{"format":"lacuna-course"}');
      const putPromise = handle(
        putShareRequest(shareId, 'payload', writeToken, EMPTY_SLOT_ETAG, payload),
      );
      await putEntered;

      const deleted = await handle(
        new Request(`http://relay.test/shares/${shareId}`, {
          method: 'DELETE',
          headers: { Origin: ORIGIN, Authorization: `Bearer ${writeToken}` },
        }),
      );
      expect(deleted.status).toBe(204);

      releasePut();
      const putResult = await putPromise;
      expectCors(putResult);
      expect(putResult.status).toBe(404);

      expect((await handle(getShareRequest(shareId, 'payload'))).status).toBe(404);
      expect((await handle(getShareRequest(shareId, 'meta'))).status).toBe(404);
    },
  );

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

  it('counts share mints per platform address despite forged x-forwarded-for prefixes', async () => {
    vi.stubEnv('VERCEL', '1');
    const store = new MemoryStore();
    const mint = (handle: ReturnType<typeof createHandler>, forged: string) =>
      handle(
        new Request('http://relay.test/shares', {
          method: 'POST',
          headers: {
            Origin: ORIGIN,
            'x-vercel-forwarded-for': '198.51.100.9',
            'x-forwarded-for': `${forged}, 198.51.100.9`,
          },
        }),
      );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await mint(createHandler(store), `203.0.113.${attempt}`)).status).toBe(201);
    }
    expect((await mint(createHandler(store), '203.0.113.200')).status).toBe(429);
  });

  it('persists the share mint counter in the store, not module state', async () => {
    const store = new MemoryStore();
    const mint = (handle: ReturnType<typeof createHandler>) =>
      handle(
        new Request('http://relay.test/shares', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'x-forwarded-for': '198.51.100.9' },
        }),
      );
    const first = createHandler(store);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await mint(first)).status).toBe(201);
    }
    expect(await store.list('ai-rate/share-mint/')).toHaveLength(1);
    expect((await mint(createHandler(store))).status).toBe(429);
    expect((await mint(createHandler(new MemoryStore()))).status).toBe(201);
  });

  it('sweeps shares untouched past the TTL plus grace without reading their bodies', async () => {
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
    const payload = new Uint8Array(1_928_490);
    expect(
      (await handle(putShareRequest(shareId, 'payload', writeToken, EMPTY_SLOT_ETAG, payload)))
        .status,
    ).toBe(204);

    now += 91 * 24 * 60 * 60 * 1000;
    const get = store.get.bind(store);
    let bodyBytesRead = 0;
    vi.spyOn(store, 'get').mockImplementation(async (key) => {
      const stored = await get(key);
      bodyBytesRead += stored?.body.byteLength ?? 0;
      return stored;
    });
    const result = await cleanupExpiredShares(store, now);
    expect(result).toEqual({ sharesDeleted: 1, shareObjectsDeleted: 2 });
    expect(bodyBytesRead).toBe(0);
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

async function mintedShare(store = new MemoryStore(), now?: () => number) {
  const handle = createHandler(store, { now });
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

class ShareUploadRaceStore extends MemoryStore {
  private payloadGate: (() => Promise<void>) | null = null;

  gatePayloadPut(gate: () => Promise<void>): void {
    this.payloadGate = gate;
  }

  override async put(key: string, body: Uint8Array, opts: PutOptions) {
    if (key.startsWith('shares/') && key.endsWith('/payload') && this.payloadGate) {
      const gate = this.payloadGate;
      this.payloadGate = null;
      await gate();
    }
    return super.put(key, body, opts);
  }
}
