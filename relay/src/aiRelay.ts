import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeAiSessionMetadata, type AiSessionMetadata } from './aiSessionMetadata.js';
import { canonicalEtag, type BlobStore } from './store.js';

export const AI_PAIRING_TTL_MS = 10 * 60 * 1000;
export const AI_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_AI_MAILBOX_BYTES = 1024 * 1024;
const MAX_AI_JSON_BYTES = 4 * 1024;
const GENERATION_HEADER = 'X-Lacuna-Generation';
const SESSION_ID_RE = /^[A-HJ-KM-NP-TV-Z2-9]{20}$/;
const PUBLIC_KEY_RE = /^[A-Za-z0-9_-]{80,100}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

type AiMailbox = 'browser' | 'terminal';

export type AiRelayRoute =
  | { kind: 'ai-session-collection' }
  | { kind: 'ai-session'; id: string }
  | { kind: 'ai-claim'; id: string }
  | { kind: 'ai-peer'; id: string }
  | { kind: 'ai-mailbox'; id: string; mailbox: AiMailbox }
  | { kind: 'ai-invalid' };

export function matchAiRelayPath(parts: string[]): AiRelayRoute | null {
  if (parts[0] !== 'ai') return null;
  if (parts.length === 2 && parts[1] === 'sessions') {
    return { kind: 'ai-session-collection' };
  }
  if (parts.length < 3 || parts[1] !== 's' || parts[2] === undefined) {
    return { kind: 'ai-invalid' };
  }
  const id = normaliseSessionId(parts[2]);
  if (id === null) return { kind: 'ai-invalid' };
  if (parts.length === 3) return { kind: 'ai-session', id };
  if (parts.length !== 4 || parts[3] === undefined) return { kind: 'ai-invalid' };
  if (parts[3] === 'claim') return { kind: 'ai-claim', id };
  if (parts[3] === 'peer') return { kind: 'ai-peer', id };
  if (parts[3] === 'browser' || parts[3] === 'terminal') {
    return { kind: 'ai-mailbox', id, mailbox: parts[3] };
  }
  return { kind: 'ai-invalid' };
}

export async function handleAiRelayRoute(
  store: BlobStore,
  request: Request,
  route: AiRelayRoute,
  now: () => number,
): Promise<Response> {
  switch (route.kind) {
    case 'ai-session-collection':
      return createSession(store, request, now);
    case 'ai-claim':
      return claimSession(store, request, route.id, now);
    case 'ai-peer':
      return readPeer(store, request, route.id, now);
    case 'ai-mailbox':
      return handleMailbox(store, request, route.id, route.mailbox, now);
    case 'ai-session':
      return deleteSession(store, request, route.id, now);
    case 'ai-invalid':
      return json(404, request, { error: 'not found' });
  }
}

async function createSession(
  store: BlobStore,
  request: Request,
  now: () => number,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, request, { error: 'method not allowed' });
  const body = await readJson(request);
  if (!isObject(body) || !isPublicKey(body.browserPublicKey) || Object.keys(body).length !== 1) {
    return json(400, request, { error: 'invalid request' });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sessionId = randomSessionId();
    const browserToken = randomBytes(32).toString('hex');
    const createdAt = now();
    const metadata: AiSessionMetadata = {
      version: 1,
      sessionId,
      browserPublicKey: body.browserPublicKey,
      browserTokenHash: tokenHash(browserToken),
      createdAt,
      pairingExpiresAt: createdAt + AI_PAIRING_TTL_MS,
    };
    const written = await store.put(metadataKey(sessionId), encodeJson(metadata), {
      exclusive: true,
    });
    if (written.ok) {
      return json(201, request, {
        sessionId,
        pairingCode: formatPairingCode(sessionId),
        browserToken,
        expiresAt: metadata.pairingExpiresAt,
      });
    }
  }
  return json(500, request, { error: 'internal error' });
}

async function claimSession(
  store: BlobStore,
  request: Request,
  id: string,
  now: () => number,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, request, { error: 'method not allowed' });
  const stored = await liveMetadata(store, id, now);
  if (!stored) return json(404, request, { error: 'not found' });
  if (stored.metadata.terminalTokenHash) {
    return json(409, request, { error: 'session already claimed' });
  }
  const body = await readJson(request);
  if (!isClaim(body)) return json(400, request, { error: 'invalid request' });

  const terminalToken = randomBytes(32).toString('hex');
  const claimedAt = now();
  const expiresAt = claimedAt + AI_SESSION_TTL_MS;
  const metadata: AiSessionMetadata = {
    ...stored.metadata,
    terminalPublicKey: body.terminalPublicKey,
    terminalTokenHash: tokenHash(terminalToken),
    client: body.client,
    claimedAt,
    expiresAt,
  };
  const written = await store.put(metadataKey(id), encodeJson(metadata), {
    ifMatch: stored.etag,
  });
  if (!written.ok) return json(409, request, { error: 'session already claimed' });
  return json(200, request, {
    sessionId: id,
    browserPublicKey: metadata.browserPublicKey,
    terminalToken,
    expiresAt,
  });
}

async function readPeer(
  store: BlobStore,
  request: Request,
  id: string,
  now: () => number,
): Promise<Response> {
  if (request.method !== 'GET') return json(405, request, { error: 'method not allowed' });
  const stored = await liveMetadata(store, id, now);
  if (!stored) return json(404, request, { error: 'not found' });
  if (!authorised(stored.metadata.browserTokenHash, request)) {
    return json(401, request, { error: 'unauthorised' });
  }
  const metadata = stored.metadata;
  if (!metadata.terminalPublicKey || !metadata.client || !metadata.expiresAt) {
    return json(404, request, { error: 'not found' });
  }
  return json(200, request, {
    terminalPublicKey: metadata.terminalPublicKey,
    client: metadata.client,
    expiresAt: metadata.expiresAt,
  });
}

async function handleMailbox(
  store: BlobStore,
  request: Request,
  id: string,
  mailbox: AiMailbox,
  now: () => number,
): Promise<Response> {
  const stored = await liveMetadata(store, id, now);
  if (!stored) return json(404, request, { error: 'not found' });
  const metadata = stored.metadata;
  if (!metadata.terminalTokenHash) return json(409, request, { error: 'session not claimed' });

  const writerHash = mailbox === 'browser' ? metadata.browserTokenHash : metadata.terminalTokenHash;
  const peerHash = mailbox === 'browser' ? metadata.terminalTokenHash : metadata.browserTokenHash;
  const hasAccess =
    request.method === 'PUT'
      ? authorised(writerHash, request)
      : request.method === 'GET'
        ? authorised(writerHash, request) || authorised(peerHash, request)
        : authorised(peerHash, request);
  if (!hasAccess) {
    return json(401, request, { error: 'unauthorised' });
  }
  if (request.method === 'GET') return readMailbox(store, request, id, mailbox);
  if (request.method === 'PUT') return writeMailbox(store, request, id, mailbox);
  return json(405, request, { error: 'method not allowed' });
}

async function readMailbox(
  store: BlobStore,
  request: Request,
  id: string,
  mailbox: AiMailbox,
): Promise<Response> {
  const digests = new URL(request.url).searchParams.getAll('digest');
  if (digests.length > 1 || (digests.length === 1 && !DIGEST_RE.test(digests[0]!))) {
    const response = json(400, request, { error: 'invalid digest' });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const key = mailboxKey(id, mailbox);
  const stored = await store.get(key);
  if (!stored) return json(404, request, { error: 'not found' });
  const generation = canonicalEtag(stored.etag);
  if (generation === '') return json(500, request, { error: 'internal error' });
  const quotedGeneration = `"${generation}"`;
  if (digests.length === 1) {
    const storedDigest = sha256Hex(stored.body);
    if (!timingSafeEqual(Buffer.from(storedDigest, 'hex'), Buffer.from(digests[0]!, 'hex'))) {
      const response = json(409, request, { error: 'digest mismatch' });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    const headers = corsHeaders(request);
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'no-store');
    headers.set('ETag', quotedGeneration);
    headers.set(GENERATION_HEADER, quotedGeneration);
    return new Response(JSON.stringify({ generation: quotedGeneration }), { status: 200, headers });
  }
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'no-store');
  headers.set('ETag', quotedGeneration);
  headers.set(GENERATION_HEADER, quotedGeneration);
  return new Response(Buffer.from(stored.body), { status: 200, headers });
}

async function writeMailbox(
  store: BlobStore,
  request: Request,
  id: string,
  mailbox: AiMailbox,
): Promise<Response> {
  const expected = parseGeneration(request.headers.get('If-Match'));
  if (expected === null) return json(428, request, { error: 'if-match required' });
  const body = await readBoundedBody(request, MAX_AI_MAILBOX_BYTES);
  if (!body.ok) return json(body.status, request, { error: body.error });
  const key = mailboxKey(id, mailbox);
  let written;
  if (expected === 'empty') {
    written = await store.put(key, body.bytes, { exclusive: true });
  } else {
    const expectedDigest = digestGeneration(expected);
    if (expectedDigest) {
      const current = await store.get(key);
      if (!current || sha256Hex(current.body) !== expectedDigest) {
        return json(412, request, { error: 'precondition failed' });
      }
      if (canonicalEtag(current.etag) === '') {
        return json(500, request, { error: 'internal error' });
      }
      written = await store.put(key, body.bytes, { ifMatch: current.etag });
    } else {
      written = await store.put(key, body.bytes, { ifMatch: expected });
    }
  }
  if (!written.ok) return json(412, request, { error: 'precondition failed' });
  let generation = canonicalEtag(written.etag);
  // The store may commit the bytes but omit the ETag from its write response.
  // Reconcile without writing: an overwrite here could resurrect stale bytes.
  if (generation === '') {
    const recovered = await store.get(key);
    if (!recovered || !equalBytes(recovered.body, body.bytes)) {
      return json(500, request, { error: 'internal error' });
    }
    generation = canonicalEtag(recovered.etag);
    if (generation === '') return json(500, request, { error: 'internal error' });
  }
  const quotedGeneration = `"${generation}"`;
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  headers.set('ETag', quotedGeneration);
  headers.set(GENERATION_HEADER, quotedGeneration);
  return new Response(JSON.stringify({ generation: quotedGeneration }), { status: 200, headers });
}

async function deleteSession(
  store: BlobStore,
  request: Request,
  id: string,
  now: () => number,
): Promise<Response> {
  if (request.method !== 'DELETE') return json(405, request, { error: 'method not allowed' });
  const stored = await liveMetadata(store, id, now);
  if (!stored) return json(404, request, { error: 'not found' });
  if (!authorised(stored.metadata.browserTokenHash, request)) {
    return json(401, request, { error: 'unauthorised' });
  }
  await sweep(store, id);
  return empty(204, request);
}

async function liveMetadata(
  store: BlobStore,
  id: string,
  now: () => number,
): Promise<{ metadata: AiSessionMetadata; etag: string } | null> {
  const stored = await store.get(metadataKey(id));
  if (!stored) return null;
  const metadata = decodeAiSessionMetadata(stored.body);
  if (!metadata) {
    await sweep(store, id);
    return null;
  }
  const expiresAt = metadata.expiresAt ?? metadata.pairingExpiresAt;
  if (now() >= expiresAt) {
    await sweep(store, id);
    return null;
  }
  const etag = canonicalEtag(stored.etag);
  if (etag === '') return null;
  return { metadata, etag };
}

async function sweep(store: BlobStore, id: string): Promise<void> {
  const objects = await store.list(sessionPrefix(id));
  if (objects.length > 0) await store.del(objects.map((object) => object.key));
}

function isClaim(value: unknown): value is {
  terminalPublicKey: string;
  client: { name: string; version?: string };
} {
  if (!isObject(value) || !isPublicKey(value.terminalPublicKey) || !isObject(value.client)) {
    return false;
  }
  const clientKeys = Object.keys(value.client);
  if (clientKeys.some((key) => key !== 'name' && key !== 'version')) return false;
  if (!boundedText(value.client.name, 100)) return false;
  if (value.client.version !== undefined && !boundedText(value.client.version, 100)) return false;
  return Object.keys(value).length === 2;
}

async function readJson(request: Request): Promise<unknown> {
  const body = await readBoundedBody(request, MAX_AI_JSON_BYTES);
  if (!body.ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body.bytes)) as unknown;
  } catch {
    return null;
  }
}

type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | {
      ok: false;
      status: 400 | 413;
      error: 'invalid length' | 'length mismatch' | 'payload too large';
    };

async function readBoundedBody(request: Request, maximum: number): Promise<BoundedBodyResult> {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength < 0) {
    return { ok: false, status: 400, error: 'invalid length' };
  }
  if (declaredLength !== null && declaredLength > maximum) {
    return { ok: false, status: 413, error: 'payload too large' };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    if (declaredLength !== null && declaredLength !== 0) {
      return { ok: false, status: 400, error: 'length mismatch' };
    }
    return { ok: true, bytes: new Uint8Array() };
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (done) continue;
    length += chunk.value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      return { ok: false, status: 413, error: 'payload too large' };
    }
    chunks.push(chunk.value);
  }
  if (declaredLength !== null && length !== declaredLength) {
    return { ok: false, status: 400, error: 'length mismatch' };
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

function randomSessionId(): string {
  const bytes = randomBytes(20);
  let value = '';
  for (const byte of bytes) value += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return value;
}

function formatPairingCode(id: string): string {
  return id.match(/.{1,4}/g)?.join('-') ?? id;
}

function normaliseSessionId(value: string): string | null {
  const normalised = value.replaceAll('-', '').toUpperCase();
  return SESSION_ID_RE.test(normalised) ? normalised : null;
}

function isPublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || !PUBLIC_KEY_RE.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').byteLength === 65;
  } catch {
    return false;
  }
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function authorised(expectedHash: string, request: Request): boolean {
  const header = request.headers.get('Authorization');
  const match = header ? /^Bearer[ \t]+(\S+)$/.exec(header) : null;
  const token = match?.[1];
  if (!token || !TOKEN_RE.test(token)) return false;
  const presented = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestGeneration(value: string): string | null {
  return /^sha256:([0-9a-f]{64})$/.exec(canonicalEtag(value))?.[1] ?? null;
}

function contentLength(request: Request): number | null {
  const raw = request.headers.get('Content-Length');
  if (raw === null || !/^[0-9]+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : -1;
}

function parseGeneration(value: string | null): 'empty' | string | null {
  if (value === null || value.trim() === '') return null;
  let trimmed = value.trim();
  if (trimmed.startsWith('W/')) trimmed = trimmed.slice(2).trim();
  const bare = canonicalEtag(trimmed);
  if (bare === '') return null;
  return bare === '0' ? 'empty' : trimmed;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function metadataKey(id: string): string {
  return `${sessionPrefix(id)}meta`;
}

function mailboxKey(id: string, mailbox: AiMailbox): string {
  return `${sessionPrefix(id)}${mailbox}`;
}

function sessionPrefix(id: string): string {
  return `ai/${id}/`;
}

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin');
  return new Headers({
    'Access-Control-Allow-Origin': origin && origin !== '' ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': `ETag, ${GENERATION_HEADER}`,
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  });
}

function json(status: number, request: Request, body: Record<string, unknown>): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number, request: Request): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}
