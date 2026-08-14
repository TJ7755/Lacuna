import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BlobStore } from './store';

/** Snapshots carry inline assets. Arc 8 §13.3: start at 25 MB and name the cap. */
export const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * A channel with no write for this long is treated as gone. Matches the app's
 * 90-day tombstone window: a device that can no longer merge also cannot fetch
 * a blob that has sat untouched for that long.
 */
export const CHANNEL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
    if (request.method === 'OPTIONS') {
      return empty(204, request);
    }

    const route = parseRoute(request.url);
    try {
      switch (route.kind) {
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
    } catch {
      return json(500, request, { error: 'internal error' });
    }
  };
}

async function handleChannel(store: BlobStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, request, { error: 'method not allowed' });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const channelId = randomBytes(CHANNEL_ID_BYTES).toString('hex');
    const writeToken = randomBytes(WRITE_TOKEN_BYTES).toString('hex');
    const created = await store.create(metaKey(channelId), hashToken(writeToken));
    if (created) {
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
  if (auth !== 'ok') return json(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

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

  const loaded = await loadSlot(store, id, slot);
  if (loaded.generation === 0 || !loaded.body) {
    return json(404, request, { error: 'not found' });
  }
  const { generation, body } = loaded;

  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'no-store');
  headers.set('ETag', quoteGeneration(generation));
  return new Response(Buffer.from(body), { status: 200, headers });
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
  if (auth !== 'ok') return json(auth, request, { error: auth === 401 ? 'unauthorized' : 'not found' });

  const ifMatch = request.headers.get('If-Match');
  if (ifMatch === null || ifMatch.trim() === '') {
    return json(428, request, { error: 'if-match required' });
  }
  const expected = parseGeneration(ifMatch);
  if (expected === null) {
    return json(400, request, { error: 'invalid if-match' });
  }

  const current = (await loadSlot(store, id, slot)).generation;
  if (current !== expected) {
    return json(412, request, { error: 'precondition failed' });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== length) {
    return json(400, request, { error: 'length mismatch' });
  }

  const next = expected + 1;
  const created = await store.create(slotKey(id, slot, next), body);
  if (!created) {
    return json(412, request, { error: 'precondition failed' });
  }

  await store.put(headKey(id, slot), encodeGeneration(next));
  if (expected > 0) await store.del([slotKey(id, slot, expected)]);

  const headers = corsHeaders(request);
  headers.set('ETag', quoteGeneration(next));
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

type Route =
  | { kind: 'channel' }
  | { kind: 'item'; id: string }
  | { kind: 'slot'; id: string; slot: Slot }
  | { kind: 'slot-invalid' }
  | { kind: 'unknown' };

function parseRoute(url: string): Route {
  const path = new URL(url, 'http://relay.invalid').pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();

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
  return { kind: 'unknown' };
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

function parseGeneration(header: string): number | null {
  const trimmed = header.trim();
  if (trimmed.startsWith('W/')) return null;
  const inner =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  if (!/^[0-9]+$/.test(inner)) return null;
  const value = Number(inner);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function quoteGeneration(generation: number): string {
  return `"${generation}"`;
}

function metaKey(id: string): string {
  return `c/${id}/meta`;
}

function slotKey(id: string, slot: Slot, generation: number): string {
  return `c/${id}/${slot}/${generation}`;
}

function headKey(id: string, slot: Slot): string {
  return `c/${id}/${slot}/head`;
}

function channelPrefix(id: string): string {
  return `c/${id}/`;
}

function encodeGeneration(generation: number): Uint8Array {
  return new TextEncoder().encode(String(generation));
}

function decodeGeneration(body: Uint8Array): number | null {
  const raw = new TextDecoder().decode(body);
  if (!/^[0-9]+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

async function readGeneration(store: BlobStore, id: string, slot: Slot): Promise<number> {
  const stored = await store.get(headKey(id, slot));
  if (!stored) return 0;
  return decodeGeneration(stored.body) ?? 0;
}

/**
 * Read the slot, and finish a pointer write that crashed after the exclusive
 * create. Only looks one generation ahead at a time; a crash leaves at most
 * that one unpointed object.
 */
async function loadSlot(
  store: BlobStore,
  id: string,
  slot: Slot,
): Promise<{ generation: number; body: Uint8Array | null }> {
  let generation = await readGeneration(store, id, slot);
  let body: Uint8Array | null = null;

  for (;;) {
    const newer = await store.get(slotKey(id, slot, generation + 1));
    if (!newer) break;
    generation += 1;
    body = newer.body;
    await store.put(headKey(id, slot), encodeGeneration(generation));
  }

  if (body) return { generation, body };
  if (generation === 0) return { generation: 0, body: null };
  const stored = await store.get(slotKey(id, slot, generation));
  return { generation, body: stored?.body ?? null };
}

async function channelLive(store: BlobStore, id: string, now: () => number): Promise<boolean> {
  const stamps: number[] = [];
  for (const key of [metaKey(id), headKey(id, 'state'), headKey(id, 'keybag')]) {
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

function json(status: number, request: Request, body: { error?: string; channelId?: string; writeToken?: string }): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number, request: Request): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}
