import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalEtag, type BlobStore } from './store.js';
import { CHANNEL_CLEANUP_GRACE_MS, CHANNEL_TTL_MS } from './channelMaintenance.js';

/**
 * Teacher-published course snapshots behind a stable link. A share is an
 * opaque byte group the relay never inspects: `payload` carries the course
 * file, `meta` carries the teacher client's small manifest (lineage id,
 * revision, published-at) so students can poll for updates without
 * downloading the whole course. Knowledge of the share id is the read
 * capability; writes need the bearer token minted with the share.
 */
export type ShareSlot = 'payload' | 'meta';

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

const SHARE_MINT_RATE_LIMIT = 10;
const SHARE_MINT_WINDOW_MS = 60 * 60 * 1000;
type RateLimitAttempts = Map<string, { count: number; resetAt: number }>;
const shareMintAttempts: RateLimitAttempts = new Map();

export function __resetShareMintRateLimitForTests(): void {
  shareMintAttempts.clear();
}

export async function handleShareMint(store: BlobStore, request: Request): Promise<Response> {
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
    const ip = getShareClientIp(request);
    if (isShareRateLimited(ip, Date.now())) {
      return shareJson(429, request, { error: 'too many requests' });
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shareId = randomBytes(SHARE_ID_BYTES).toString('hex');
    const writeToken = randomBytes(WRITE_TOKEN_BYTES).toString('hex');
    const created = await store.put(shareAuthKey(shareId), hashShareToken(writeToken), {
      exclusive: true,
    });
    if (created.ok) {
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
  if (!SHARE_ID_RE.test(id)) {
    return shareJson(404, request, { error: 'not found' });
  }
  if (request.method !== 'DELETE') {
    return shareJson(405, request, { error: 'method not allowed' });
  }

  const live = await shareLive(store, id, now);
  if (!live) {
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

  const stored = await store.get(shareSlotKey(id, slot));
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
    await sweepShare(store, id);
    return shareJson(404, request, { error: 'not found' });
  }

  const auth = await authorizeShare(store, id, request);
  if (auth !== 'ok')
    return shareJson(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

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

async function authorizeShare(
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
const SHARE_KEY_RE = /^shares\/([0-9a-f]{32})\/(?:auth|payload|meta)$/;

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
      ['auth', 'payload', 'meta'].map((name) => store.get(`${prefix}${name}`)),
    );
    if (
      fresh.some(
        (object) => object && now - object.uploadedAt < CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS,
      )
    ) {
      continue;
    }
    await store.del(objects.map((object) => object.key));
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

function shareAuthKey(id: string): string {
  return `shares/${id}/auth`;
}

function shareSlotKey(id: string, slot: ShareSlot): string {
  return `shares/${id}/${slot}`;
}

async function shareLive(store: BlobStore, id: string, now: () => number): Promise<boolean> {
  const stamps: number[] = [];
  for (const key of [shareAuthKey(id), shareSlotKey(id, 'payload'), shareSlotKey(id, 'meta')]) {
    const stored = await store.get(key);
    if (stored) stamps.push(stored.uploadedAt);
  }
  if (stamps.length === 0) return false;
  return now() - Math.max(...stamps) < CHANNEL_TTL_MS;
}

async function sweepShare(store: BlobStore, id: string): Promise<void> {
  const objects = await store.list(`shares/${id}/`);
  if (objects.length > 0) await store.del(objects.map((object) => object.key));
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

function getShareClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

function isShareRateLimited(ip: string, now: number): boolean {
  const entry = shareMintAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    shareMintAttempts.set(ip, { count: 1, resetAt: now + SHARE_MINT_WINDOW_MS });
    return false;
  }
  if (entry.count >= SHARE_MINT_RATE_LIMIT) return true;
  entry.count += 1;
  return false;
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
  const origin = request.headers.get('Origin');
  return new Headers({
    'Access-Control-Allow-Origin': origin && origin !== '' ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  });
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
