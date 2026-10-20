import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalEtag, type BlobStore } from './store.js';
import { consumeRatePermit } from './rateLimit.js';
import { CHANNEL_CLEANUP_GRACE_MS, CHANNEL_TTL_MS } from './channelMaintenance.js';
import { relayCorsHeaders } from './cors.js';
import { insightDayExpiresAt } from './insightsProtocol.js';

/**
 * Teacher-published course snapshots behind a stable link. A share is an
 * opaque byte group the relay never inspects: `payload` carries the course
 * file, `meta` carries the teacher client's small manifest (lineage id,
 * revision, published-at) so students can poll for updates without
 * downloading the whole course. Knowledge of the share id is the read
 * capability; writes need the bearer token minted with the share.
 */
export type ShareSlot = 'payload' | 'meta' | 'teacher';

/**
 * Payloads transit the relay function body, so they must stay well under
 * Vercel's ~4.5 MB inbound ceiling. Larger courses keep the manual
 * `.lacuna` file path; the 413 message says so.
 */
export const SHARE_PAYLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** The polling manifest is a small JSON document, never course content. */
export const SHARE_META_MAX_BYTES = 8 * 1024;

export const SHARE_ID_RE = /^[0-9a-f]{32}$/;

const SHARE_ID_BYTES = 16;
const WRITE_TOKEN_BYTES = 32;

/** Unwritten-slot sentinel. Not a Blob ETag. */
export const EMPTY_SHARE_ETAG = '"0"';

export interface ShareCleanupResult {
  sharesDeleted: number;
  shareObjectsDeleted: number;
}

export async function handleShareMint(
  store: BlobStore,
  request: Request,
  now: number,
): Promise<Response> {
  if (request.method !== 'POST') {
    return shareJson(405, request, { error: 'method not allowed' });
  }

  const secret = configuredShareMintSecret();
  const authHeader = request.headers.get('Authorization');
  if (secret !== null && authHeader) {
    if (!authorizeShareMint(request, secret))
      return shareJson(401, request, { error: 'unauthorized' });
  } else if (authHeader && secret === null) {
    return shareJson(401, request, { error: 'unauthorized' });
  } else if (!authHeader) {
    const permit = await consumeRatePermit(store, request, now, 'share-mint');
    if (permit === 'limited') return shareJson(429, request, { error: 'too many requests' });
    if (permit === 'unavailable') {
      return shareJson(503, request, { error: 'rate limit unavailable' });
    }
  }

  let sourceId: string | null = null;
  if (request.body) {
    const reader = request.body.getReader();
    let body = '';
    let length = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 128) {
          await reader.cancel();
          return shareJson(413, request, { error: 'payload too large' });
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    if (length > 0) {
      try {
        const parsed: unknown = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        const fields = parsed as Record<string, unknown>;
        if (
          Object.keys(fields).length !== 1 ||
          typeof fields.sourceShareId !== 'string' ||
          !SHARE_ID_RE.test(fields.sourceShareId)
        )
          throw new Error();
        sourceId = await courseSource(store, fields.sourceShareId, () => now);
        if (
          !sourceId ||
          !(await store.get(shareSlotKey(sourceId, 'payload'))) ||
          !(await store.get(shareSlotKey(sourceId, 'meta')))
        ) {
          return shareJson(404, request, { error: 'source course not found' });
        }
      } catch {
        return shareJson(400, request, { error: 'invalid source share' });
      }
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shareId = randomBytes(SHARE_ID_BYTES).toString('hex');
    const writeToken = randomBytes(WRITE_TOKEN_BYTES).toString('hex');
    const created = await store.put(shareAuthKey(shareId), hashShareToken(writeToken), {
      exclusive: true,
    });
    if (created.ok) {
      if (sourceId) {
        // The id is not exposed until its immutable content source is committed.
        const linked = await store.put(
          shareSourceKey(shareId),
          new TextEncoder().encode(sourceId),
          {
            exclusive: true,
          },
        );
        if (!linked.ok) {
          await sweepShare(store, shareId);
          return shareJson(500, request, { error: 'internal error' });
        }
      }
      return shareJson(201, request, { shareId, writeToken });
    }
  }
  return shareJson(500, request, { error: 'internal error' });
}

export async function handleShareItem(
  store: BlobStore,
  request: Request,
  id: string,
  now: () => number,
): Promise<Response> {
  if (request.method === 'HEAD') {
    const headers = shareCorsHeaders(request);
    headers.set('Cache-Control', 'no-store');
    if (!SHARE_ID_RE.test(id)) return new Response(null, { status: 404, headers });
    const auth = await authorizeShare(store, id, request);
    const status = auth === 'ok' ? ((await shareLive(store, id, now)) ? 204 : 410) : auth;
    // Verification must not renew the share or run the expired-share deletion path.
    return new Response(null, { status, headers });
  }
  if (!SHARE_ID_RE.test(id)) {
    return shareJson(404, request, { error: 'not found' });
  }
  if (request.method !== 'DELETE') {
    return shareJson(405, request, { error: 'method not allowed' });
  }

  const live = await shareLive(store, id, now);
  if (!live && !(await hasRetainedInsights(store, id, now()))) {
    await sweepShare(store, id);
    return shareJson(404, request, { error: 'not found' });
  }

  const auth = await authorizeShare(store, id, request);
  if (auth !== 'ok')
    return shareJson(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

  await sweepShare(store, id);
  return shareEmpty(204, request);
}

export async function handleShareSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: ShareSlot,
  now: () => number,
): Promise<Response> {
  if (!SHARE_ID_RE.test(id)) {
    return shareJson(404, request, { error: 'not found' });
  }

  if (request.method === 'GET') {
    return getShareSlot(store, request, id, slot, now);
  }
  if (request.method === 'PUT') {
    return putShareSlot(store, request, id, slot, now);
  }
  return shareJson(405, request, { error: 'method not allowed' });
}

async function getShareSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: ShareSlot,
  now: () => number,
): Promise<Response> {
  if (!(await shareLive(store, id, now))) {
    return shareJson(404, request, { error: 'not found' });
  }

  // A slot without its auth object is an orphan left by a delete that raced
  // an upload. Knowledge of the share id alone must never serve it.
  if (!(await store.get(shareAuthKey(id)))) {
    return shareJson(404, request, { error: 'not found' });
  }

  const contentId = slot === 'teacher' ? id : await courseSource(store, id, now);
  const stored = contentId ? await store.get(shareSlotKey(contentId, slot)) : null;
  if (!stored) {
    return shareJson(404, request, { error: 'not found' });
  }

  if (canonicalEtag(stored.etag) === '') {
    return shareJson(500, request, { error: 'internal error' });
  }

  const headers = shareCorsHeaders(request);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'no-store');
  headers.set('ETag', quoteShareEtag(stored.etag));
  return new Response(Buffer.from(stored.body), { status: 200, headers });
}

async function putShareSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: ShareSlot,
  now: () => number,
): Promise<Response> {
  const cap = slot === 'payload' ? SHARE_PAYLOAD_MAX_BYTES : SHARE_META_MAX_BYTES;
  const length = readShareContentLength(request);
  if (length === 'missing') {
    return shareJson(411, request, { error: 'length required' });
  }
  if (length === 'invalid') {
    return shareJson(400, request, { error: 'invalid length' });
  }
  if (length > cap) {
    return shareJson(
      413,
      request,
      slot === 'payload'
        ? { error: 'Course file too large for a share link. Send the course file instead.' }
        : { error: 'payload too large' },
    );
  }

  if (!(await shareLive(store, id, now))) {
    if (!(await hasRetainedInsights(store, id, now()))) await sweepShare(store, id);
    return shareJson(404, request, { error: 'not found' });
  }

  const auth = await authorizeShare(store, id, request);
  if (auth !== 'ok')
    return shareJson(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

  if (slot !== 'teacher' && (await store.get(shareSourceKey(id)))) {
    return shareJson(409, request, { error: 'linked course content is read-only' });
  }

  const ifMatch = request.headers.get('If-Match');
  if (ifMatch === null || ifMatch.trim() === '') {
    return shareJson(428, request, { error: 'if-match required' });
  }
  const expected = parseShareIfMatch(ifMatch);
  if (expected === null) {
    return shareJson(400, request, { error: 'invalid if-match' });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== length) {
    return shareJson(400, request, { error: 'length mismatch' });
  }

  const written =
    expected === 'empty'
      ? await store.put(shareSlotKey(id, slot), body, { exclusive: true })
      : await store.put(shareSlotKey(id, slot), body, { ifMatch: expected });

  if (!written.ok) {
    return shareJson(412, request, { error: 'precondition failed' });
  }

  // A DELETE may have swept the group after this upload passed its checks.
  // Share ids are 128-bit random and never reused, so sweeping the group
  // here cannot harm a legitimate share; it removes the orphan just written.
  if (!(await store.get(shareAuthKey(id)))) {
    await sweepShare(store, id);
    return shareJson(404, request, { error: 'not found' });
  }

  let etag = written.etag;
  if (canonicalEtag(etag) === '') {
    const stored = await store.get(shareSlotKey(id, slot));
    if (
      !stored ||
      canonicalEtag(stored.etag) === '' ||
      stored.body.byteLength !== body.byteLength ||
      !timingSafeEqual(stored.body, body)
    ) {
      return shareJson(500, request, { error: 'internal error' });
    }
    etag = stored.etag;
  }

  const headers = shareCorsHeaders(request);
  headers.set('ETag', quoteShareEtag(etag));
  return new Response(null, { status: 204, headers });
}

export async function authorizeShare(
  store: BlobStore,
  id: string,
  request: Request,
): Promise<'ok' | 401 | 404> {
  const token = shareBearerToken(request);
  if (token === null) return 401;
  const auth = await store.get(shareAuthKey(id));
  if (!auth) return 404;
  const presented = hashShareToken(token);
  if (presented.length !== auth.body.length || !timingSafeEqual(presented, auth.body)) {
    return 401;
  }
  return 'ok';
}

const SHARE_CURSOR_KEY = 'maintenance/share-cursor';
const SHARE_KEY_RE = /^shares\/([0-9a-f]{32})\/(?:auth|payload|meta|teacher|source)$/;

/**
 * Reclaim shares untouched for longer than the channel TTL plus grace, so an
 * abandoned classroom link stops consuming Blob storage. Same window as sync
 * channels: a teacher who republishes keeps the link alive indefinitely.
 */
export async function cleanupExpiredShares(
  store: BlobStore,
  now: number,
): Promise<ShareCleanupResult> {
  const storedCursor = await store.get(SHARE_CURSOR_KEY);
  const cursor = storedCursor ? new TextDecoder().decode(storedCursor.body) : undefined;
  const page = await store.listPage('shares/', cursor, 100);
  const ids = new Set<string>();
  for (const object of page.objects) {
    const id = SHARE_KEY_RE.exec(object.key)?.[1];
    if (id) ids.add(id);
  }

  let sharesDeleted = 0;
  let shareObjectsDeleted = 0;
  for (const id of ids) {
    const prefix = `shares/${id}/`;
    const objects = await store.list(prefix);
    if (objects.length === 0) continue;
    const current = await Promise.all(objects.map((object) => store.get(object.key)));
    const latest = Math.max(...current.map((object) => object?.uploadedAt ?? 0));
    if (now - latest < CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS) continue;

    const fresh = await Promise.all(
      ['auth', 'payload', 'meta', 'teacher', 'source'].map((name) => store.get(`${prefix}${name}`)),
    );
    if (
      fresh.some(
        (object) => object && now - object.uploadedAt < CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS,
      )
    ) {
      continue;
    }
    if (await shareLive(store, id, () => now - CHANNEL_CLEANUP_GRACE_MS)) continue;
    if (await hasRetainedInsights(store, id, now)) continue;
    await sweepShare(store, id);
    sharesDeleted += 1;
    shareObjectsDeleted += objects.length;
  }

  if (page.cursor) {
    await store.put(SHARE_CURSOR_KEY, new TextEncoder().encode(page.cursor), { overwrite: true });
  } else if (storedCursor) {
    await store.del([SHARE_CURSOR_KEY]);
  }

  return { sharesDeleted, shareObjectsDeleted };
}

function shareSourceKey(id: string): string {
  return `shares/${id}/source`;
}

/** Flatten classroom links to the publisher, never to another teacher's keys or mailbox. */
async function courseSource(
  store: BlobStore,
  id: string,
  now: () => number,
): Promise<string | null> {
  const visited = new Set<string>();
  for (let hop = 0; hop < 8; hop += 1) {
    if (
      !SHARE_ID_RE.test(id) ||
      visited.has(id) ||
      !(await store.get(shareAuthKey(id))) ||
      !(await shareLive(store, id, now))
    )
      return null;
    visited.add(id);
    const source = await store.get(shareSourceKey(id));
    if (!source) return id;
    id = new TextDecoder().decode(source.body);
  }
  return null;
}

function shareAuthKey(id: string): string {
  return `shares/${id}/auth`;
}

function shareSlotKey(id: string, slot: ShareSlot): string {
  return `shares/${id}/${slot}`;
}

export async function shareLive(store: BlobStore, id: string, now: () => number): Promise<boolean> {
  const [latest, source] = await Promise.all([
    lastShareWrite(store, id),
    store.get(shareSourceKey(id)),
  ]);
  if (latest !== null && now() - latest < CHANNEL_TTL_MS) return true;
  if (!source || !(await store.get(shareAuthKey(id)))) return false;
  const sourceId = new TextDecoder().decode(source.body);
  if (!SHARE_ID_RE.test(sourceId) || !(await store.get(shareAuthKey(sourceId)))) return false;
  // Mint flattens links to the publisher. Its updates also keep classroom links alive.
  const sourceLatest = await lastShareWrite(store, sourceId);
  return sourceLatest !== null && now() - sourceLatest < CHANNEL_TTL_MS;
}

async function lastShareWrite(store: BlobStore, id: string): Promise<number | null> {
  const objects = await Promise.all(
    ['auth', 'payload', 'meta', 'teacher', 'source'].map((name) =>
      store.get(`shares/${id}/${name}`),
    ),
  );
  const stamps = objects.flatMap((stored) => (stored ? [stored.uploadedAt] : []));
  return stamps.length ? Math.max(...stamps) : null;
}

async function sweepShare(store: BlobStore, id: string): Promise<void> {
  const objects = (
    await Promise.all([store.list(`shares/${id}/`), store.list(`insights/${id}/`)])
  ).flat();
  if (objects.length > 0) await store.del(objects.map((object) => object.key));
}

async function hasRetainedInsights(store: BlobStore, id: string, now: number): Promise<boolean> {
  const prefix = `insights/${id}/`;
  const objects = await store.list(prefix);
  return objects.some(({ key }) => {
    const match = /^(\d{4}-\d{2}-\d{2})\/envelopes\/[0-9a-f]{32}$/.exec(key.slice(prefix.length));
    try {
      return match !== null && insightDayExpiresAt(match[1]!) > now;
    } catch {
      return false;
    }
  });
}

function configuredShareMintSecret(): string | null {
  const raw = process.env.RELAY_MINT_SECRET;
  if (raw === undefined) return null;
  const secret = raw.trim();
  return secret === '' ? null : secret;
}

function authorizeShareMint(request: Request, secret: string): boolean {
  const token = shareBearerToken(request);
  if (token === null) return false;
  const presented = hashShareToken(token);
  const expected = hashShareToken(secret);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return false;
  }
  return true;
}

function shareBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/.exec(header);
  return match?.[1] ?? null;
}

function hashShareToken(token: string): Uint8Array {
  return createHash('sha256').update(token, 'utf8').digest();
}

function readShareContentLength(request: Request): number | 'missing' | 'invalid' {
  const raw = request.headers.get('Content-Length');
  if (raw === null || raw.trim() === '') return 'missing';
  if (!/^[0-9]+$/.test(raw.trim())) return 'invalid';
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value)) return 'invalid';
  return value;
}

function parseShareIfMatch(header: string): 'empty' | string | null {
  let trimmed = header.trim();
  if (trimmed.startsWith('W/')) trimmed = trimmed.slice(2).trim();
  const bare = canonicalEtag(trimmed);
  if (bare === '') return null;
  if (bare === '0') return 'empty';
  return trimmed;
}

function quoteShareEtag(etag: string): string {
  const bare = canonicalEtag(etag);
  return `"${bare}"`;
}

function shareCorsHeaders(request: Request): Headers {
  return relayCorsHeaders(request, 'ETag');
}

function shareJson(
  status: number,
  request: Request,
  body: { error?: string; shareId?: string; writeToken?: string },
): Response {
  const headers = shareCorsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function shareEmpty(status: number, request: Request): Response {
  return new Response(null, { status, headers: shareCorsHeaders(request) });
}
