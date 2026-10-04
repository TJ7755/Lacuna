import { createHash, timingSafeEqual } from 'node:crypto';
import { readAiSessionExpiry } from './aiSessionMetadata.js';
import { cleanupExpiredChannels } from './channelMaintenance.js';
import { cleanupExpiredShares } from './shares.js';
import {
  CLEARED_RATE_RECORD,
  RATE_KEY_RE,
  decodeRateRecord,
  encodeRateRecord,
} from './rateLimit.js';
import { canonicalEtag, type BlobStore, type ListedObject } from './store.js';

export const AI_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

export async function handleAiMaintenanceRoute(
  store: BlobStore,
  request: Request,
  now: number,
): Promise<Response> {
  if (!authorisedCron(request)) return maintenanceJson(401, { error: 'unauthorised' });
  if (request.method !== 'GET') return maintenanceJson(405, { error: 'method not allowed' });
  const ai = await cleanupAiState(store, now);
  const channels = await cleanupExpiredChannels(store, now);
  const shares = await cleanupExpiredShares(store, now);
  return maintenanceJson(200, { ...ai, ...channels, ...shares });
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
