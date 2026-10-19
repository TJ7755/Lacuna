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
  type InsightMailboxPage,
} from './insightsProtocol.js';

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
  if (!(await shareLive(store, id, now)) || !(await store.get(`shares/${id}/auth`))) {
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
      if (stored.body.byteLength > INSIGHT_MAX_ENVELOPE_BYTES) throw new Error('oversized');
      envelopes.push({
        slotId,
        envelope: parseInsightEnvelope(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stored.body)),
          { shareId: id, isoDay: day },
        ),
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
  let body: Uint8Array;
  try {
    const raw = await readBody(request, Number(length));
    const envelope = parseInsightEnvelope(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
      { shareId: id, isoDay: day },
    );
    body = new TextEncoder().encode(JSON.stringify(envelope));
  } catch {
    return reply(request, 400, { error: 'invalid insights envelope' });
  }
  if (!(await store.get(`shares/${id}/auth`))) return reply(request, 404, { error: 'not found' });
  if (now() >= insightDayExpiresAt(day)) return reply(request, 410, { error: 'insights expired' });
  const key = `insights/${id}/${day}/envelopes/${slotId}`;
  const existing = await store.get(key);
  if (existing) return reply(request, Buffer.from(existing.body).equals(body) ? 204 : 409);
  const permit = await consumeCounterPermit(store, `insights/${id}/${day}/quota`, now(), {
    limit: INSIGHT_DAILY_SLOTS,
    windowMs: INSIGHT_RETENTION_DAYS * INSIGHT_DAY_MS,
  });
  if (permit !== 'allowed')
    return reply(request, permit === 'limited' ? 429 : 503, {
      error: 'mailbox capacity unavailable',
    });
  // A failed or duplicate concurrent upload can consume a reservation. Do not
  // refund across writers: conservative capacity is safer than exceeding the cap.
  const written = await store.put(key, body, { exclusive: true });
  if (!(await store.get(`shares/${id}/auth`)) || now() >= insightDayExpiresAt(day)) {
    await store.del([key]);
    return reply(request, 404, { error: 'not found' });
  }
  if (!written.ok) {
    const other = await store.get(key);
    return reply(request, other && Buffer.from(other.body).equals(body) ? 204 : 409);
  }
  return reply(request, 204);
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
