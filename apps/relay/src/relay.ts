import { readBoundedBytes } from './requestBody.js';
import {
  matchRelayRoute,
  matchRelayInvalidSlot,
  relayResponseSchema,
  relayLimits,
} from '@lacuna/protocol/relay/index';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalEtag, type BlobStore } from './store.js';
import { handleAiRelayRoute, type AiRelayRoute } from './aiRelay.js';
import { handleAiMaintenanceRoute } from './aiMaintenance.js';
import { consumeRatePermit } from './rateLimit.js';
import { CHANNEL_TTL_MS } from './channelMaintenance.js';
import {
  handleClassCodeCreate,
  handleClassCodeLookup,
  handleShareItem,
  handleShareMint,
  handleShareSlot,
  type ShareSlot,
} from './shares.js';
import { relayCorsHeaders } from './cors.js';
import { handleInsight } from './insights.js';

export { AI_PAIRING_TTL_MS, AI_SESSION_TTL_MS } from './aiRelay.js';
export { CHANNEL_TTL_MS } from './channelMaintenance.js';
export { SHARE_META_MAX_BYTES, SHARE_PAYLOAD_MAX_BYTES } from './shares.js';

/** Snapshots carry inline assets. Arc 8 §13.3: start at 25 MB and name the cap. */
export const MAX_BODY_BYTES = relayLimits.channel;

/**
 * A channel with no write for this long is treated as gone. Matches the app's
 * 90-day tombstone window: a device that can no longer merge also cannot fetch
 * a blob that has sat untouched for that long.
 */

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

  async function dispatch(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return empty(204, request);
      }

      const route = parseRoute(request.url);
      switch (route.kind) {
        case 'insight':
          return await handleInsight(store, request, route.id, route.day, route.slotId, now);
        case 'ai-maintenance':
          return await handleAiMaintenanceRoute(store, request, now());
        case 'ai-session-collection':
          if (request.method === 'POST') {
            const permit = await consumeRatePermit(store, request, now(), 'pairing');
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
          return await handleChannel(store, request, now());
        case 'item':
          return await handleItem(store, request, route.id, now);
        case 'slot':
          return await handleSlot(store, request, route.id, route.slot, now);
        case 'slot-invalid':
          return json(400, request, { error: 'invalid slot' });
        case 'class-code':
          return await handleClassCodeLookup(store, request, route.code, now);
        case 'share-class-code':
          return await handleClassCodeCreate(store, request, route.id, now);
        case 'share-collection':
          return await handleShareMint(store, request, now());
        case 'share-item':
          return await handleShareItem(store, request, route.id, now);
        case 'share-slot':
          return await handleShareSlot(store, request, route.id, route.slot, now);
        case 'share-slot-invalid':
          return json(400, request, { error: 'invalid slot' });
        default:
          return json(404, request, { error: 'not found' });
      }
    } catch (err) {
      console.error('relay internal error:', describeInternalError(err));
      return json(500, request, { error: 'internal error' });
    }
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return empty(204, request);
    const matched = matchRelayRoute(request.url, request.method);
    if (!matched) {
      if (matchRelayInvalidSlot(request.url)) return json(400, request, { error: 'invalid slot' });
      return json(matchRelayRoute(request.url) ? 405 : 404, request, {
        error: matchRelayRoute(request.url) ? 'method not allowed' : 'not found',
      });
    }
    const response = await dispatch(request);
    for (const [name, value] of corsHeaders(request)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    const schema = relayResponseSchema(matched.endpoint, response.status);
    if (!schema) return json(500, request, { error: 'internal error' });
    try {
      const contentType = response.headers.get('Content-Type') ?? '';
      const body: unknown =
        response.body === null || response.status === 204 || request.method === 'HEAD'
          ? null
          : contentType.includes('application/json')
            ? await response.clone().json()
            : response.headers.get('Content-Type') === null
              ? null
              : new Uint8Array(await response.clone().arrayBuffer());
      schema.parse(body);
      return response;
    } catch {
      return json(500, request, { error: 'internal error' });
    }
  };
}

async function handleChannel(store: BlobStore, request: Request, now: number): Promise<Response> {
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
    const permit = await consumeRatePermit(store, request, now, 'channel-mint');
    if (permit === 'limited') return json(429, request, { error: 'too many requests' });
    if (permit === 'unavailable') return json(503, request, { error: 'rate limit unavailable' });
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

  const body = await readBoundedBytes(request, MAX_BODY_BYTES);
  if (body === null) return json(413, request, { error: 'payload too large' });
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
  | { kind: 'insight'; id: string; day: string; slotId?: string }
  | { kind: 'channel' }
  | { kind: 'item'; id: string }
  | { kind: 'slot'; id: string; slot: Slot }
  | { kind: 'slot-invalid' }
  | { kind: 'class-code'; code: string }
  | { kind: 'share-class-code'; id: string }
  | { kind: 'share-collection' }
  | { kind: 'share-item'; id: string }
  | { kind: 'share-slot'; id: string; slot: ShareSlot }
  | { kind: 'share-slot-invalid' }
  | { kind: 'unknown' };

/** Only the function entry point accepts the catch-all rewrite hint. */
export function parseRoute(url: string): Route {
  const match = matchRelayRoute(url);
  if (!match) return { kind: matchRelayInvalidSlot(url) ?? 'unknown' };
  return { kind: match.definition.kind, ...match.params } as Route;
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
  return relayCorsHeaders(request, 'ETag');
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
