import { isoDayStartMs } from '@lacuna/protocol/insights/insightsDay';

export const INSIGHT_MAX_EVIDENCE_BYTES = 65_536;
export const INSIGHT_MAX_ENVELOPE_BYTES = 90 * 1024;
export const INSIGHT_PAGE_SIZE = 16;
export const INSIGHT_DAILY_SLOTS = 50;
export const INSIGHT_RETENTION_DAYS = 84;
export const INSIGHT_DAY_MS = 24 * 60 * 60 * 1000;
export const INSIGHT_ID_RE = /^[0-9a-f]{32}$/;

export interface InsightEnvelope {
  v: 2;
  s: string;
  d: string;
  k: string;
  x: string;
  n: string;
  c: string;
}

export interface InsightEnvelopeContext {
  shareId: string;
  isoDay: string;
}
export interface InsightMailboxPage {
  v: 2;
  envelopes: { slotId: string; envelope: InsightEnvelope }[];
  cursor: string | null;
}

export function parseInsightMailboxPage(
  raw: unknown,
  context: InsightEnvelopeContext,
): InsightMailboxPage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid insights page.');
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    value.v !== 2 ||
    !Array.isArray(value.envelopes) ||
    value.envelopes.length > INSIGHT_PAGE_SIZE ||
    !(
      value.cursor === null ||
      (typeof value.cursor === 'string' && value.cursor.length > 0 && value.cursor.length <= 2048)
    )
  )
    throw new Error('Invalid insights page.');
  const slots = new Set<string>();
  const envelopes = value.envelopes.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw new Error('Invalid insights row.');
    const item = row as Record<string, unknown>;
    if (
      Object.keys(item).length !== 2 ||
      typeof item.slotId !== 'string' ||
      !INSIGHT_ID_RE.test(item.slotId) ||
      slots.has(item.slotId)
    )
      throw new Error('Invalid insights slot.');
    slots.add(item.slotId);
    return { slotId: item.slotId, envelope: parseInsightEnvelope(item.envelope, context) };
  });
  return { v: 2, envelopes, cursor: value.cursor };
}

/** One format for the browser and the self-contained relay deployment. */
export function parseInsightEnvelope(
  raw: unknown,
  context?: InsightEnvelopeContext,
): InsightEnvelope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid insights envelope.');
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== 7 ||
    value.v !== 2 ||
    typeof value.s !== 'string' ||
    !INSIGHT_ID_RE.test(value.s) ||
    typeof value.d !== 'string' ||
    typeof value.k !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.k)
  ) {
    throw new Error('Invalid insights envelope.');
  }
  isoDayStartMs(value.d);
  requireEncodedBytes(value.x, 384, 384);
  requireEncodedBytes(value.n, 12, 12);
  requireEncodedBytes(value.c, 16, INSIGHT_MAX_EVIDENCE_BYTES + 16);
  if (context && (value.s !== context.shareId || value.d !== context.isoDay)) {
    throw new Error('Insights routing does not match the envelope.');
  }
  return { v: 2, s: value.s, d: value.d, k: value.k, x: value.x, n: value.n, c: value.c };
}

function requireEncodedBytes(value: unknown, min: number, max: number): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(max / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('Invalid insights encoded bytes.');
  }
  const bytes = atob(value);
  if (bytes.length < min || bytes.length > max || btoa(bytes) !== value)
    throw new Error('Invalid insights encoded bytes.');
}

export function insightDayExpiresAt(day: string): number {
  return isoDayStartMs(day) + (INSIGHT_RETENTION_DAYS + 1) * INSIGHT_DAY_MS;
}

/** Late uploads and retries never extend the fixed reporting-day deadline. */
export function requireInsightDay(day: string, now: number): void {
  if (!Number.isFinite(now) || isoDayStartMs(day) > now || insightDayExpiresAt(day) <= now) {
    throw new Error('The insights day is in the future or expired.');
  }
}
