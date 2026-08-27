import { createHash, timingSafeEqual } from 'node:crypto';
import { readAiSessionExpiry } from './aiSessionMetadata.js';
import { canonicalEtag, type BlobStore, type ListedObject } from './store.js';

const AI_PAIRING_RATE_LIMIT = 10;
const AI_PAIRING_RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_CAS_ATTEMPTS = 5;
export const AI_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;
const RATE_KEY_RE = /^ai-rate\/pairing\/[0-9a-f]{64}$/;

interface PairingRateRecord {
  version: 1;
  count: number;
  resetAt: number;
}

const CLEARED_RATE_RECORD: PairingRateRecord = { version: 1, count: 0, resetAt: 0 };

export type AiPairingPermit = 'allowed' | 'limited' | 'unavailable';

export async function handleAiMaintenanceRoute(
  store: BlobStore,
  request: Request,
  now: number,
): Promise<Response> {
  if (!authorisedCron(request)) return maintenanceJson(401, { error: 'unauthorised' });
  if (request.method !== 'GET') return maintenanceJson(405, { error: 'method not allowed' });
  return maintenanceJson(200, await cleanupAiState(store, now));
}

export async function consumeAiPairingPermit(
  store: BlobStore,
  request: Request,
  now: number,
): Promise<AiPairingPermit> {
  const key = pairingRateKey(trustedClientAddress(request));

  for (let attempt = 0; attempt < RATE_LIMIT_CAS_ATTEMPTS; attempt += 1) {
    const stored = await store.get(key);
    if (!stored) {
      const created = await store.put(
        key,
        encodeRateRecord({
          version: 1,
          count: 1,
          resetAt: now + AI_PAIRING_RATE_WINDOW_MS,
        }),
        { exclusive: true },
      );
      if (created.ok) return 'allowed';
      continue;
    }

    const record = decodeRateRecord(stored.body);
    const etag = canonicalEtag(stored.etag);
    if (!record || etag === '') return 'unavailable';
    if (now < record.resetAt && record.count >= AI_PAIRING_RATE_LIMIT) return 'limited';

    const next: PairingRateRecord =
      now >= record.resetAt
        ? { version: 1, count: 1, resetAt: now + AI_PAIRING_RATE_WINDOW_MS }
        : { ...record, count: record.count + 1 };
    const updated = await store.put(key, encodeRateRecord(next), { ifMatch: etag });
    if (updated.ok) return 'allowed';
  }

  return 'unavailable';
}

function trustedClientAddress(request: Request): string {
  const vercelAddress = firstForwardedAddress(request.headers.get('x-vercel-forwarded-for'));
  if (vercelAddress) return vercelAddress;

  // Vercel always supplies x-vercel-forwarded-for. Fallback headers are accepted only for the
  // documented off-Vercel deployment path, where the operator controls the front proxy.
  if (process.env.VERCEL) return 'unknown';
  return (
    firstForwardedAddress(request.headers.get('x-forwarded-for')) ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'
  );
}

function firstForwardedAddress(value: string | null): string | null {
  const address = value?.split(',')[0]?.trim();
  return address ? address.toLowerCase() : null;
}

function pairingRateKey(address: string): string {
  const digest = createHash('sha256')
    .update('lacuna-ai-pairing-ip-v1\0', 'utf8')
    .update(address, 'utf8')
    .digest('hex');
  return `ai-rate/pairing/${digest}`;
}

function authorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('Authorization');
  const match = header ? /^Bearer[ \t]+(\S+)$/.exec(header) : null;
  const token = match?.[1];
  if (!token) return false;
  const presented = createHash('sha256').update(token, 'utf8').digest();
  const expected = createHash('sha256').update(secret, 'utf8').digest();
  return timingSafeEqual(presented, expected);
}

async function cleanupAiState(
  store: BlobStore,
  now: number,
): Promise<{ sessionsDeleted: number; rateRecordsDeleted: number; objectsDeleted: number }> {
  const sessionObjects = await store.list('ai/');
  const { sessions, ungrouped } = groupSessionObjects(sessionObjects);
  let sessionsDeleted = 0;
  let rateRecordsDeleted = 0;
  let objectsDeleted = 0;

  for (const listed of ungrouped) {
    const current = await store.get(listed.key);
    if (!current || now - current.uploadedAt < AI_CLEANUP_GRACE_MS) continue;
    await store.del([listed.key]);
    objectsDeleted += 1;
  }

  for (const [sessionId] of sessions) {
    const prefix = `ai/${sessionId}/`;
    const currentObjects = await store.list(prefix);
    if (currentObjects.length === 0) continue;
    const metadata = await store.get(`${prefix}meta`);
    const expiry = metadata ? readAiSessionExpiry(metadata.body, sessionId) : null;
    const latestUpload = Math.max(...currentObjects.map((object) => object.uploadedAt));
    const removable =
      expiry === null
        ? now - latestUpload >= AI_CLEANUP_GRACE_MS
        : now - expiry >= AI_CLEANUP_GRACE_MS;
    if (!removable) continue;
    await store.del(currentObjects.map((object) => object.key));
    sessionsDeleted += 1;
    objectsDeleted += currentObjects.length;
  }

  const rateObjects = await store.list('ai-rate/');
  for (const listed of rateObjects) {
    const current = await store.get(listed.key);
    if (!current) continue;
    if (!RATE_KEY_RE.test(listed.key)) {
      if (now - current.uploadedAt < AI_CLEANUP_GRACE_MS) continue;
      await store.del([listed.key]);
      rateRecordsDeleted += 1;
      objectsDeleted += 1;
      continue;
    }

    const record = decodeRateRecord(current.body);
    if (record?.count === 0) continue;
    const removable = record
      ? now - record.resetAt >= AI_CLEANUP_GRACE_MS
      : now - current.uploadedAt >= AI_CLEANUP_GRACE_MS;
    if (!removable) continue;
    const etag = canonicalEtag(current.etag);
    if (etag === '') continue;
    const cleared = await store.put(listed.key, encodeRateRecord(CLEARED_RATE_RECORD), {
      ifMatch: etag,
    });
    if (!cleared.ok) continue;
    rateRecordsDeleted += 1;
  }

  return { sessionsDeleted, rateRecordsDeleted, objectsDeleted };
}

function groupSessionObjects(objects: ListedObject[]): {
  sessions: Map<string, ListedObject[]>;
  ungrouped: ListedObject[];
} {
  const sessions = new Map<string, ListedObject[]>();
  const ungrouped: ListedObject[] = [];
  for (const object of objects) {
    const match = /^ai\/([^/]+)\/.+$/.exec(object.key);
    const sessionId = match?.[1];
    if (!sessionId) {
      ungrouped.push(object);
      continue;
    }
    const current = sessions.get(sessionId) ?? [];
    current.push(object);
    sessions.set(sessionId, current);
  }
  return { sessions, ungrouped };
}

function maintenanceJson(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function encodeRateRecord(record: PairingRateRecord): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}

function decodeRateRecord(bytes: Uint8Array): PairingRateRecord | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (
      !isObject(value) ||
      Object.keys(value).some((key) => !['version', 'count', 'resetAt'].includes(key))
    ) {
      return null;
    }
    if (
      value.version !== 1 ||
      !Number.isInteger(value.count) ||
      typeof value.count !== 'number' ||
      value.count < 0 ||
      value.count > AI_PAIRING_RATE_LIMIT ||
      !isTimestamp(value.resetAt) ||
      (value.count === 0 && value.resetAt !== 0) ||
      (value.count > 0 && value.resetAt === 0)
    ) {
      return null;
    }
    return { version: 1, count: value.count, resetAt: value.resetAt };
  } catch {
    return null;
  }
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
