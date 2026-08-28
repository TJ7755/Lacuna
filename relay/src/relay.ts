import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalEtag, type BlobStore } from './store.js';
import { handleAiRelayRoute, matchAiRelayPath, type AiRelayRoute } from './aiRelay.js';
import { consumeAiPairingPermit, handleAiMaintenanceRoute } from './aiMaintenance.js';

export { AI_PAIRING_TTL_MS, AI_SESSION_TTL_MS } from './aiRelay.js';

/** Snapshots carry inline assets. Arc 8 §13.3: start at 25 MB and name the cap. */
export const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * A channel with no write for this long is treated as gone. Matches the app's
 * 90-day tombstone window: a device that can no longer merge also cannot fetch
 * a blob that has sat untouched for that long.
 */
export const CHANNEL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Unwritten-slot sentinel. Not a Blob ETag. */
export const EMPTY_SLOT_ETAG = '"0"';

const CHANNEL_ID_BYTES = 16;
const WRITE_TOKEN_BYTES = 32;
const CHANNEL_ID_RE = /^[0-9a-f]{32}$/;

export type Slot = 'state' | 'keybag';

export interface HandlerOptions {
  now?: () => number;
}

export function createHandler(store: BlobStore, opts: HandlerOptions = {}) {
  const now = opts.now ?? Date.now;

  return async function handle(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return empty(204, request);
      }

      const route = parseRoute(request.url);
      switch (route.kind) {
        case 'ai-maintenance':
          return await handleAiMaintenanceRoute(store, request, now());
        case 'ai-session-collection':
          if (request.method === 'POST') {
            const permit = await consumeAiPairingPermit(store, request, now());
            if (permit === 'limited') {
              return json(429, request, { error: 'too many requests' });
            }
            if (permit === 'unavailable') {
              return json(503, request, { error: 'rate limit unavailable' });
            }
          }
          return await handleAiRelayRoute(store, request, route, now);
        case 'ai-session':
        case 'ai-claim':
        case 'ai-peer':
        case 'ai-mailbox':
        case 'ai-invalid':
          return await handleAiRelayRoute(store, request, route, now);
        case 'channel':
          return await handleChannel(store, request);
        case 'item':
          return await handleItem(store, request, route.id, now);
        case 'slot':
          return await handleSlot(store, request, route.id, route.slot, now);
        case 'slot-invalid':
          return json(400, request, { error: 'invalid slot' });
        default:
          return json(404, request, { error: 'not found' });
      }
    } catch (err) {
      console.error('relay internal error:', describeInternalError(err));
      return json(500, request, { error: 'internal error' });
    }
  };
}

const MINT_RATE_LIMIT = 10;
const MINT_WINDOW_MS = 60 * 60 * 1000;
type RateLimitAttempts = Map<string, { count: number; resetAt: number }>;
const deviceSyncMintAttempts: RateLimitAttempts = new Map();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

function isRateLimited(attempts: RateLimitAttempts, ip: string, now: number): boolean {
  const entry = attempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + MINT_WINDOW_MS });
    return false;
  }
  if (entry.count >= MINT_RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

export function __resetMintRateLimitForTests(): void {
  deviceSyncMintAttempts.clear();
}

async function handleChannel(store: BlobStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, request, { error: 'method not allowed' });
  }

  const secret = configuredMintSecret();
  const authHeader = request.headers.get('Authorization');
  if (secret !== null && authHeader) {
    if (!authorizeMint(request, secret)) return json(401, request, { error: 'unauthorized' });
  } else if (authHeader && secret === null) {
    return json(401, request, { error: 'unauthorized' });
  } else if (!authHeader) {
    const ip = getClientIp(request);
    if (isRateLimited(deviceSyncMintAttempts, ip, Date.now())) {
      return json(429, request, { error: 'too many requests' });
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const channelId = randomBytes(CHANNEL_ID_BYTES).toString('hex');
    const writeToken = randomBytes(WRITE_TOKEN_BYTES).toString('hex');
    const created = await store.put(metaKey(channelId), hashToken(writeToken), { exclusive: true });
    if (created.ok) {
      return json(201, request, { channelId, writeToken });
    }
  }
  return json(500, request, { error: 'internal error' });
}

async function handleItem(
  store: BlobStore,
  request: Request,
  id: string,
  now: () => number,
): Promise<Response> {
  if (!CHANNEL_ID_RE.test(id)) {
    return json(404, request, { error: 'not found' });
  }
  if (request.method !== 'DELETE') {
    return json(405, request, { error: 'method not allowed' });
  }

  const live = await channelLive(store, id, now);
  if (!live) {
    await sweep(store, id);
    return json(404, request, { error: 'not found' });
  }

  const auth = await authorize(store, id, request);
  if (auth !== 'ok')
    return json(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

  await sweep(store, id);
  return empty(204, request);
}

async function handleSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: Slot,
  now: () => number,
): Promise<Response> {
  if (!CHANNEL_ID_RE.test(id)) {
    return json(404, request, { error: 'not found' });
  }

  if (request.method === 'GET') {
    return getSlot(store, request, id, slot, now);
  }
  if (request.method === 'PUT') {
    return putSlot(store, request, id, slot, now);
  }
  return json(405, request, { error: 'method not allowed' });
}

async function getSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: Slot,
  now: () => number,
): Promise<Response> {
  if (!(await channelLive(store, id, now))) {
    return json(404, request, { error: 'not found' });
  }

  const stored = await store.get(slotKey(id, slot));
  if (!stored) {
    return json(404, request, { error: 'not found' });
  }

  // Without a generation there is no safe compare-and-swap repair. An
  // unconditional rewrite could overwrite a concurrent successor with these
  // stale bytes, so fail closed instead.
  if (canonicalEtag(stored.etag) === '') {
    return json(500, request, { error: 'internal error' });
  }

  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'no-store');
  headers.set('ETag', quoteEtag(stored.etag));
  return new Response(Buffer.from(stored.body), { status: 200, headers });
}

async function putSlot(
  store: BlobStore,
  request: Request,
  id: string,
  slot: Slot,
  now: () => number,
): Promise<Response> {
  const length = readContentLength(request);
  if (length === 'missing') {
    return json(411, request, { error: 'length required' });
  }
  if (length === 'invalid') {
    return json(400, request, { error: 'invalid length' });
  }
  if (length > MAX_BODY_BYTES) {
    return json(413, request, { error: 'payload too large' });
  }

  if (!(await channelLive(store, id, now))) {
    await sweep(store, id);
    return json(404, request, { error: 'not found' });
  }

  const auth = await authorize(store, id, request);
  if (auth !== 'ok')
    return json(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

  const ifMatch = request.headers.get('If-Match');
  if (ifMatch === null || ifMatch.trim() === '') {
    return json(428, request, { error: 'if-match required' });
  }
  const expected = parseIfMatch(ifMatch);
  if (expected === null) {
    return json(400, request, { error: 'invalid if-match' });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== length) {
    return json(400, request, { error: 'length mismatch' });
  }

  const written =
    expected === 'empty'
      ? await store.put(slotKey(id, slot), body, { exclusive: true })
      : await store.put(slotKey(id, slot), body, { ifMatch: expected });

  if (!written.ok) {
    return json(412, request, { error: 'precondition failed' });
  }

  // A successful write whose response lost its ETag may still be recovered by
  // reading it back. Accept only an exact byte match with a usable generation:
  // a different body is a concurrent successor and must never be overwritten.
  let etag = written.etag;
  if (canonicalEtag(etag) === '') {
    const stored = await store.get(slotKey(id, slot));
    if (
      !stored ||
      canonicalEtag(stored.etag) === '' ||
      stored.body.byteLength !== body.byteLength ||
      !timingSafeEqual(stored.body, body)
    ) {
      return json(500, request, { error: 'internal error' });
    }
    etag = stored.etag;
  }

  const headers = corsHeaders(request);
  headers.set('ETag', quoteEtag(etag));
  return new Response(null, { status: 204, headers });
}

async function authorize(
  store: BlobStore,
  id: string,
  request: Request,
): Promise<'ok' | 401 | 404> {
  const token = bearerToken(request);
  if (token === null) return 401;
  const meta = await store.get(metaKey(id));
  if (!meta) return 404;
  const presented = hashToken(token);
  if (presented.length !== meta.body.length || !timingSafeEqual(presented, meta.body)) {
    return 401;
  }
  return 'ok';
}

/**
 * Shared mint secret from the environment. Whitespace-only is treated as
 * unset: a missing-secret-means-no-auth fallback is the mistake this exists
 * to prevent.
 */
function configuredMintSecret(): string | null {
  const raw = process.env.RELAY_MINT_SECRET;
  if (raw === undefined) return null;
  const secret = raw.trim();
  return secret === '' ? null : secret;
}

function authorizeMint(request: Request, secret: string): boolean {
  const token = bearerToken(request);
  if (token === null) return false;
  const presented = hashToken(token);
  const expected = hashToken(secret);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return false;
  }
  return true;
}

export type Route =
  | AiRelayRoute
  | { kind: 'ai-maintenance' }
  | { kind: 'channel' }
  | { kind: 'item'; id: string }
  | { kind: 'slot'; id: string; slot: Slot }
  | { kind: 'slot-invalid' }
  | { kind: 'unknown' };

/**
 * Resolve a relay route from the URL the handler actually sees.
 *
 * After a Vercel rewrite to `/api`, unused path params become query params
 * (`/c/:id/:slot` → `/api?id=&slot=`). We also stamp `__path` on every rewrite
 * so `POST /channel` is not lost when the pathname collapses to `/api`. If
 * `request.url` still carries the original public path, the pathname wins.
 */
export function parseRoute(url: string): Route {
  const parsed = new URL(url, 'http://relay.invalid');
  const fromPath = matchPath(parsed.pathname);
  if (fromPath) return fromPath;

  const hinted = parsed.searchParams.get('__path');
  if (hinted) {
    const fromHint = matchPath(hinted);
    if (fromHint) return fromHint;
  }

  return matchRewriteQuery(parsed.searchParams) ?? { kind: 'unknown' };
}

function matchPath(pathname: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();

  if (parts.length === 2 && parts[0] === 'ai' && parts[1] === 'maintenance') {
    return { kind: 'ai-maintenance' };
  }

  const aiRoute = matchAiRelayPath(parts);
  if (aiRoute) return aiRoute;

  if (parts.length === 1 && parts[0] === 'channel') return { kind: 'channel' };
  if (parts.length === 2 && parts[0] === 'c' && parts[1] !== undefined) {
    return { kind: 'item', id: parts[1] };
  }
  if (parts.length === 3 && parts[0] === 'c' && parts[1] !== undefined && parts[2] !== undefined) {
    const slot = parts[2];
    if (slot === 'state' || slot === 'keybag') {
      return { kind: 'slot', id: parts[1], slot };
    }
    return { kind: 'slot-invalid' };
  }
  return null;
}

function matchRewriteQuery(params: URLSearchParams): Route | null {
  const id = params.get('id');
  const slot = params.get('slot');
  if (id && slot) {
    if (slot === 'state' || slot === 'keybag') return { kind: 'slot', id, slot };
    return { kind: 'slot-invalid' };
  }
  if (id) return { kind: 'item', id };
  return null;
}

/** Operator-facing error text. Strips hex that could be a channel id or token. */
export function describeInternalError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth += 1) {
    if (current instanceof Error) {
      parts.push(
        current.name === 'Error' ? current.message : `${current.name}: ${current.message}`,
      );
      current = current.cause;
      continue;
    }
    parts.push(typeof current);
    break;
  }
  return redactCapabilities(parts.join(' | '));
}

function redactCapabilities(text: string): string {
  return text.replace(/[0-9a-f]{32,}/gi, '[redacted]');
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/.exec(header);
  return match?.[1] ?? null;
}

function hashToken(token: string): Uint8Array {
  return createHash('sha256').update(token, 'utf8').digest();
}

function readContentLength(request: Request): number | 'missing' | 'invalid' {
  const raw = request.headers.get('Content-Length');
  if (raw === null || raw.trim() === '') return 'missing';
  if (!/^[0-9]+$/.test(raw.trim())) return 'invalid';
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value)) return 'invalid';
  return value;
}

function parseIfMatch(header: string): 'empty' | string | null {
  let trimmed = header.trim();
  if (trimmed.startsWith('W/')) trimmed = trimmed.slice(2).trim();
  const bare = canonicalEtag(trimmed);
  if (bare === '') return null;
  if (bare === '0') return 'empty';
  return trimmed;
}

function quoteEtag(etag: string): string {
  const bare = canonicalEtag(etag);
  return `"${bare}"`;
}

function metaKey(id: string): string {
  return `c/${id}/meta`;
}

function slotKey(id: string, slot: Slot): string {
  return `c/${id}/${slot}`;
}

function channelPrefix(id: string): string {
  return `c/${id}/`;
}

async function channelLive(store: BlobStore, id: string, now: () => number): Promise<boolean> {
  const stamps: number[] = [];
  for (const key of [metaKey(id), slotKey(id, 'state'), slotKey(id, 'keybag')]) {
    const stored = await store.get(key);
    if (stored) stamps.push(stored.uploadedAt);
  }
  if (stamps.length === 0) return false;
  return now() - Math.max(...stamps) < CHANNEL_TTL_MS;
}

async function sweep(store: BlobStore, id: string): Promise<void> {
  const objects = await store.list(channelPrefix(id));
  if (objects.length > 0) await store.del(objects.map((object) => object.key));
}

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin');
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin && origin !== '' ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  });
  return headers;
}

function json(
  status: number,
  request: Request,
  body: { error?: string; channelId?: string; writeToken?: string },
): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number, request: Request): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}
