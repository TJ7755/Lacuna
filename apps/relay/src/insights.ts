import { createHash, timingSafeEqual } from 'node:crypto';
import { relayCorsHeaders } from './cors.js';
import { consumeCounterPermit, consumeRatePermit } from './rateLimit.js';
import { authorizeShare, shareLive } from './shares.js';
import type { BlobStore } from './store.js';
import {
  INSIGHT_ID_RE,
  INSIGHT_MAX_ENVELOPE_BYTES,
  INSIGHT_PAGE_SIZE,
  INSIGHT_RETENTION_DAYS,
  INSIGHT_DAY_MS,
  INSIGHT_DAILY_SLOTS,
  insightDayExpiresAt,
  parseInsightEnvelope,
  requireInsightDay,
  type InsightEnvelope,
  type InsightEnvelopeContext,
  type InsightMailboxPage,
} from '@lacuna/protocol/insights/index';

export async function handleInsight(
  store: BlobStore,
  request: Request,
  id: string,
  day: string,
  slotId: string | undefined,
  now: () => number,
): Promise<Response> {
  if (process.env.RELAY_INSIGHTS_ENABLED !== '1')
    return reply(request, 503, { error: 'insights disabled' });
  if (!INSIGHT_ID_RE.test(id)) return reply(request, 404, { error: 'not found' });
  if (slotId !== undefined && !INSIGHT_ID_RE.test(slotId))
    return reply(request, 400, { error: 'invalid slot' });
  if (
    !(request.method === 'GET' && slotId === undefined) &&
    !(request.method === 'PUT' && slotId !== undefined)
  ) {
    return reply(request, 405, { error: 'method not allowed' });
  }
  try {
    if (now() >= insightDayExpiresAt(day))
      return reply(request, 410, { error: 'insights expired' });
    requireInsightDay(day, now());
  } catch {
    return reply(request, 400, { error: 'invalid reporting day' });
  }
  const permit = await consumeRatePermit(store, request, now(), 'insights');
  if (permit !== 'allowed')
    return reply(request, permit === 'limited' ? 429 : 503, { error: 'insights request limit' });
  if (
    (request.method === 'PUT' && !(await shareLive(store, id, now))) ||
    !(await store.get(`shares/${id}/auth`))
  ) {
    return reply(request, 404, { error: 'not found' });
  }
  return slotId === undefined
    ? readPage(store, request, id, day, now)
    : writeEnvelope(store, request, id, day, slotId, now);
}

async function readPage(
  store: BlobStore,
  request: Request,
  id: string,
  day: string,
  now: () => number,
): Promise<Response> {
  const auth = await authorizeShare(store, id, request);
  if (auth !== 'ok') return reply(request, auth, { error: 'unauthorised' });
  const query = new URL(request.url).searchParams;
  const cursor = query.get('cursor') ?? undefined;
  if (
    (cursor !== undefined && (!cursor || cursor.length > 2048)) ||
    query.getAll('cursor').length > 1
  ) {
    return reply(request, 400, { error: 'invalid cursor' });
  }
  const prefix = `insights/${id}/${day}/envelopes/`;
  const page = await store.listPage(prefix, cursor, INSIGHT_PAGE_SIZE);
  const envelopes: InsightMailboxPage['envelopes'] = [];
  for (const listed of page.objects) {
    const slotId = listed.key.slice(prefix.length);
    if (!listed.key.startsWith(prefix) || !INSIGHT_ID_RE.test(slotId))
      return reply(request, 503, { error: 'mailbox unavailable' });
    const stored = await store.get(listed.key);
    if (!stored) continue;
    try {
      envelopes.push({
        slotId,
        envelope: parseStoredInsight(stored.body, { shareId: id, isoDay: day }).envelope,
      });
    } catch {
      return reply(request, 503, { error: 'mailbox unavailable' });
    }
  }
  // Revocation or expiry can race the object reads; never return the cached page afterwards.
  const freshAuth = await authorizeShare(store, id, request);
  if (freshAuth !== 'ok') return reply(request, freshAuth, { error: 'unauthorised' });
  if (now() >= insightDayExpiresAt(day)) return reply(request, 410, { error: 'insights expired' });
  return reply(request, 200, { v: 2, envelopes, cursor: page.cursor ?? null });
}

async function writeEnvelope(
  store: BlobStore,
  request: Request,
  id: string,
  day: string,
  slotId: string,
  now: () => number,
): Promise<Response> {
  const tokenHeader = request.headers.get('Authorization');
  const revisionHeader = request.headers.get('X-Insights-Revision');
  let snapshot: { writeTokenHash: string; revision: number } | undefined;
  if (tokenHeader !== null || revisionHeader !== null) {
    const token = /^Bearer ([0-9a-f]{64})$/.exec(tokenHeader ?? '')?.[1];
    if (!token) return reply(request, 401, { error: 'unauthorised' });
    if (
      !/^[1-9][0-9]*$/.test(revisionHeader ?? '') ||
      !Number.isSafeInteger(Number(revisionHeader))
    )
      return reply(request, 400, { error: 'invalid insights revision' });
    snapshot = {
      writeTokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      revision: Number(revisionHeader),
    };
  }
  const length = request.headers.get('Content-Length');
  if (length === null) return reply(request, 411, { error: 'length required' });
  if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
    return reply(request, 400, { error: 'invalid length' });
  if (Number(length) > INSIGHT_MAX_ENVELOPE_BYTES)
    return reply(request, 413, { error: 'envelope too large' });
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return reply(request, 415, { error: 'JSON envelope required' });
  }
  let envelope: InsightEnvelope;
  try {
    const raw = await readBody(request, Number(length));
    envelope = parseInsightEnvelope(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
      { shareId: id, isoDay: day },
    );
  } catch {
    return reply(request, 400, { error: 'invalid insights envelope' });
  }
  if (!(await shareLive(store, id, now)) || !(await store.get(`shares/${id}/auth`)))
    return reply(request, 404, { error: 'not found' });
  if (now() >= insightDayExpiresAt(day)) return reply(request, 410, { error: 'insights expired' });
  const key = `insights/${id}/${day}/envelopes/${slotId}`;
  const existing = await store.get(key);
  const context = { shareId: id, isoDay: day };
  let current: StoredInsight | undefined;
  if (existing) {
    try {
      current = parseStoredInsight(existing.body, context);
    } catch {
      return reply(request, 503, { error: 'mailbox unavailable' });
    }
    if (current.v === 1) {
      if (!snapshot || !sameWriteToken(current, snapshot))
        return reply(request, 401, { error: 'unauthorised' });
      if (snapshot.revision === current.revision && sameEnvelope(current.envelope, envelope))
        return acknowledge();
      if (snapshot.revision !== current.revision + 1) return reply(request, 409);
    } else {
      // Legacy slots remain immutable, including when a snapshot client retries them.
      return sameEnvelope(current.envelope, envelope) ? acknowledge() : reply(request, 409);
    }
  } else {
    if (snapshot && snapshot.revision !== 1) return reply(request, 409);
    // Failed or duplicate concurrent creates can consume a reservation. Refunding
    // across writers could exceed the cap; replacements never reserve capacity.
    const permit = await consumeCounterPermit(store, `insights/${id}/${day}/quota`, now(), {
      limit: INSIGHT_DAILY_SLOTS,
      windowMs: INSIGHT_RETENTION_DAYS * INSIGHT_DAY_MS,
    });
    if (permit !== 'allowed')
      return reply(request, permit === 'limited' ? 429 : 503, {
        error: 'mailbox capacity unavailable',
      });
  }
  const body = new TextEncoder().encode(
    JSON.stringify(snapshot ? { v: 1, envelope, ...snapshot } : envelope),
  );
  const written = await store.put(
    key,
    body,
    existing ? { ifMatch: existing.etag } : { exclusive: true },
  );
  if (!written.ok) {
    const other = await store.get(key);
    if (!other) return reply(request, 409);
    try {
      const winner = parseStoredInsight(other.body, context);
      const matches =
        winner.v === 1
          ? snapshot && sameWriteToken(winner, snapshot) && winner.revision === snapshot.revision
          : true;
      if (!matches || !sameEnvelope(winner.envelope, envelope)) return reply(request, 409);
    } catch {
      return reply(request, 503, { error: 'mailbox unavailable' });
    }
  }
  return acknowledge();

  async function acknowledge(): Promise<Response> {
    if (!(await store.get(`shares/${id}/auth`)) || now() >= insightDayExpiresAt(day)) {
      await store.del([key]);
      return reply(request, 404, { error: 'not found' });
    }
    // Public expiry must not delete a snapshot another request already acknowledged.
    if (!(await shareLive(store, id, now))) return reply(request, 404, { error: 'not found' });
    return reply(request, 204);
  }
}

type StoredInsight =
  | { v: 2; envelope: InsightEnvelope }
  | { v: 1; envelope: InsightEnvelope; writeTokenHash: string; revision: number };

function parseStoredInsight(body: Uint8Array, context: InsightEnvelopeContext): StoredInsight {
  // Allow bounded internal metadata without increasing the accepted request size.
  if (body.byteLength > INSIGHT_MAX_ENVELOPE_BYTES + 256) throw new Error('oversized');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'v' in raw && raw.v === 1) {
    const value = raw as Record<string, unknown>;
    if (
      Object.keys(value).length !== 4 ||
      typeof value.writeTokenHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.writeTokenHash) ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1
    )
      throw new Error('invalid snapshot');
    return {
      v: 1,
      envelope: parseInsightEnvelope(value.envelope, context),
      writeTokenHash: value.writeTokenHash,
      revision: value.revision,
    };
  }
  if (body.byteLength > INSIGHT_MAX_ENVELOPE_BYTES) throw new Error('oversized');
  return { v: 2, envelope: parseInsightEnvelope(raw, context) };
}

function sameWriteToken(a: { writeTokenHash: string }, b: { writeTokenHash: string }): boolean {
  return timingSafeEqual(
    Buffer.from(a.writeTokenHash, 'hex'),
    Buffer.from(b.writeTokenHash, 'hex'),
  );
}

function sameEnvelope(a: InsightEnvelope, b: InsightEnvelope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function readBody(request: Request, length: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing envelope');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > Math.min(length, INSIGHT_MAX_ENVELOPE_BYTES)) {
        await reader.cancel();
        throw new Error('invalid envelope length');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== length) throw new Error('invalid envelope length');
  return Buffer.concat(chunks);
}

function reply(request: Request, status: number, body?: object): Response {
  const headers = relayCorsHeaders(request, '');
  headers.set('Cache-Control', 'no-store');
  if (body) headers.set('Content-Type', 'application/json');
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

const CURSOR_KEY = 'maintenance/insights-cursor';
export async function cleanupExpiredInsights(
  store: BlobStore,
  now: number,
): Promise<{ insightObjectsDeleted: number }> {
  const storedCursor = await store.get(CURSOR_KEY);
  const page = await store.listPage(
    'insights/',
    storedCursor ? new TextDecoder().decode(storedCursor.body) : undefined,
    500,
  );
  const expired: string[] = [];
  for (const listed of page.objects) {
    const match =
      /^insights\/[0-9a-f]{32}\/(\d{4}-\d{2}-\d{2})\/(?:quota|envelopes\/[0-9a-f]{32})$/.exec(
        listed.key,
      );
    try {
      if (!match) throw new Error('invalid insight key');
      if (insightDayExpiresAt(match[1]!) <= now) expired.push(listed.key);
    } catch {
      const current = await store.get(listed.key);
      if (current && now - current.uploadedAt >= 24 * 60 * 60 * 1000) expired.push(listed.key);
    }
  }
  await store.del(expired);
  if (page.cursor)
    await store.put(CURSOR_KEY, new TextEncoder().encode(page.cursor), { overwrite: true });
  else if (storedCursor) await store.del([CURSOR_KEY]);
  return { insightObjectsDeleted: expired.length };
}
