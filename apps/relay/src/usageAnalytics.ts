import { createHash, timingSafeEqual } from 'node:crypto';
import packageManifest from '../../../package.json' with { type: 'json' };
import {
  USAGE_ACTIONS,
  USAGE_MAX_BODY_BYTES,
  USAGE_PAGES,
  USAGE_RETENTION_DAYS,
  isUsageMetricKey,
  usageBatchSchema,
  type UsageBatch,
} from '@lacuna/protocol/usage';
import { readBoundedBytes } from './requestBody.js';
import type { BlobStore } from './store.js';
import { usageDashboard, type UsageSummaryRow } from './usageDashboard.js';

const APP_ORIGIN = 'https://getlacuna.app';
const DAY_MS = 24 * 60 * 60 * 1000;
// Allow longer than the hosting platform's 30-minute maximum invocation before publication.
const INVOCATION_GRACE_MS = 31 * 60_000;
const COLLECT_BURST = 32;
const COLLECT_PER_SECOND = 8;
const PREFIX = 'usage/aggregate/';
const SHARD_KEY = /^usage\/aggregate\/(\d{4}-\d{2}-\d{2})\/[0-9a-f]$/;
const MAX_RECEIPTS = 8_192;
const pageCount = new Set(Object.values(USAGE_PAGES)).size;
const actionCount = USAGE_ACTIONS.length;
// Allow the full catalogue: transitions, up to 12 breakdowns per page/action,
// other page counters and their bands, and every action pair. The spare page
// slots also allow release counters carried over from recent relay builds.
const MAX_METRICS = pageCount * (pageCount + 12 * actionCount + 64) + actionCount ** 2;
const WRITE_ATTEMPTS = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const deployedRelease = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageManifest.version);
const permittedReleases = new Set<string>();
if (deployedRelease) {
  const [, major, minor, patch] = deployedRelease;
  const currentPatch = Number(patch);
  for (let number = Math.max(0, currentPatch - 2); number <= currentPatch + 2; number += 1) {
    permittedReleases.add(`${major}.${minor}.${number}`);
  }
}

type Shard = { version: 1; rows: UsageSummaryRow[]; receipts: string[] };

function dayAt(now: number, offset = 0): string {
  return new Date(now + offset * DAY_MS).toISOString().slice(0, 10);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function authorisedDashboard(request: Request, secret: string): boolean {
  const header = request.headers.get('Authorization');
  const value = header?.match(/^Basic ([A-Za-z0-9+/]{1,512}={0,2})$/i)?.[1];
  return (
    value !== undefined &&
    timingSafeEqual(
      digest(Buffer.from(value, 'base64').toString('utf8')),
      digest(`analytics:${secret}`),
    )
  );
}

function empty(status: number, cors = false): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  if (cors) {
    headers.set('Access-Control-Allow-Origin', APP_ORIGIN);
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  return new Response(null, { status, headers });
}

function dashboardResponse(status: number, html: string | null = null): Response {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  });
  if (status === 401)
    headers.set('WWW-Authenticate', 'Basic realm="Lacuna analytics", charset="UTF-8"');
  return new Response(html, { status, headers });
}

function readShard(body: Uint8Array): Shard {
  const value = JSON.parse(decoder.decode(body)) as Shard;
  if (value.version !== 1 || !Array.isArray(value.rows) || !Array.isArray(value.receipts)) {
    throw new Error('invalid analytics shard');
  }
  return value;
}

async function storeBatch(store: BlobStore, batch: UsageBatch): Promise<number> {
  // Receipts identify one random upload. Keep receipt and counter updates in the same CAS.
  const receipt = digest(batch.id).subarray(0, 16).toString('hex');
  const key = `${PREFIX}${batch.day}/${receipt[0]}`;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const current = await store.get(key);
    const shard: Shard = current ? readShard(current.body) : { version: 1, rows: [], receipts: [] };
    if (shard.receipts.includes(receipt)) return 204;
    if (shard.receipts.length >= MAX_RECEIPTS) return 422;

    const rows = new Map(shard.rows.map((row) => [row[0], row]));
    for (const [metric, count, browsers] of batch.rows) {
      const prior = rows.get(metric);
      rows.set(metric, [metric, (prior?.[1] ?? 0) + count, (prior?.[2] ?? 0) + browsers]);
    }
    if (rows.size > MAX_METRICS) return 422;
    const next: Shard = {
      version: 1,
      rows: [...rows.values()],
      receipts: [...shard.receipts, receipt],
    };
    const result = await store.put(
      key,
      encoder.encode(JSON.stringify(next)),
      current ? { ifMatch: current.etag } : { exclusive: true },
    );
    if (result.ok) return 204;
  }
  return 503;
}

async function collect(
  store: BlobStore,
  request: Request,
  now: number,
  enabled: boolean,
  admit: (now: number) => boolean,
): Promise<Response> {
  if (request.headers.get('Origin') !== APP_ORIGIN) return empty(403);
  if (!enabled) return empty(404, true);
  if (request.method === 'OPTIONS') {
    const response = empty(204, true);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }
  if (request.method !== 'POST') return empty(405, true);
  if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') {
    return empty(204, true);
  }
  if (
    request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    return empty(415, true);
  }
  const bytes = await readBoundedBytes(request, USAGE_MAX_BODY_BYTES);
  if (!bytes) return empty(413, true);
  let input: unknown;
  try {
    input = JSON.parse(decoder.decode(bytes));
  } catch {
    return empty(400, true);
  }
  const batch = usageBatchSchema.safeParse(input);
  if (!batch.success || (batch.data.day !== dayAt(now) && batch.data.day !== dayAt(now, -1))) {
    return empty(400, true);
  }
  // An unconstrained version dimension lets a few requests permanently fill a shard.
  // Keep nearby patch releases during coordinated rollouts and retain all other counters.
  const rows = batch.data.rows.filter(([metric]) => {
    return !metric.startsWith('release/') || permittedReleases.has(metric.split('/')[2]);
  });
  if (rows.length === 0) return empty(204, true);
  if (!admit(now)) return empty(429, true);
  return empty(await storeBatch(store, { ...batch.data, rows }), true);
}

/** Look up the rewritten path only at the Vercel function entry point. */
function usagePath(url: URL): string {
  return url.pathname === '/api' || url.pathname === '/api/'
    ? (url.searchParams.get('__path') ?? url.pathname)
    : url.pathname;
}

export function createUsageHandler(store: BlobStore, now: () => number = Date.now) {
  // Bound bursts reaching Blob without storing IP addresses. This budget is per
  // function instance. The stored shard limits still apply across instances.
  let remaining = COLLECT_BURST;
  let refilledAt = now();
  const admit = (at: number): boolean => {
    const elapsed = Math.max(0, at - refilledAt);
    remaining = Math.min(COLLECT_BURST, remaining + (elapsed * COLLECT_PER_SECOND) / 1_000);
    refilledAt = Math.max(at, refilledAt);
    if (remaining < 1) return false;
    remaining -= 1;
    return true;
  };

  return async function handleUsage(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const path = usagePath(url);
    if (path !== '/usage/collect' && path !== '/usage/dashboard') return undefined;
    const secret = process.env.USAGE_ANALYTICS_ADMIN_SECRET?.trim() ?? '';
    try {
      if (path === '/usage/collect') {
        const enabled = process.env.USAGE_ANALYTICS_ENABLED !== 'false';
        return await collect(store, request, now(), enabled, admit);
      }
      if (secret.length < 32) return dashboardResponse(404);
      if (request.method !== 'GET') return dashboardResponse(405);
      if (!authorisedDashboard(request, secret)) return dashboardResponse(401);
      const today = now();
      const days = dashboardDays(url.searchParams.get('days'));
      const newest = dayAt(today - INVOCATION_GRACE_MS, -2);
      const periodStart = dayAt(Date.parse(newest), 1 - days);
      const retentionStart = dayAt(today, 1 - USAGE_RETENTION_DAYS);
      const oldest = periodStart > retentionStart ? periodStart : retentionStart;
      const rows = await readDailyRows(store, oldest, newest);
      return dashboardResponse(200, usageDashboard(days, oldest, newest, rows));
    } catch {
      // The SDK may include payloads or capability material in errors.
      console.error('Usage analytics storage operation failed');
      return path === '/usage/collect'
        ? empty(503, request.headers.get('Origin') === APP_ORIGIN)
        : dashboardResponse(503);
    }
  };
}

function dashboardDays(value: string | null): number {
  return value === '1' || value === '30' || value === String(USAGE_RETENTION_DAYS)
    ? Number(value)
    : 7;
}

async function readDailyRows(store: BlobStore, oldest: string, newest: string) {
  const keys = new Map<string, string[]>();
  for (const { key } of await store.list(PREFIX)) {
    const day = SHARD_KEY.exec(key)?.[1];
    if (!day || day < oldest || day > newest) continue;
    const shards = keys.get(day) ?? [];
    shards.push(key);
    keys.set(day, shards);
  }

  const result = new Map<string, UsageSummaryRow[]>();
  for (const [day, shards] of [...keys.entries()].sort(([left], [right]) =>
    right.localeCompare(left),
  )) {
    const totals = new Map<string, UsageSummaryRow>();
    for (const current of await Promise.all(shards.map((key) => store.get(key)))) {
      if (!current) continue;
      for (const [metric, count, browsers] of readShard(current.body).rows) {
        if (!isUsageMetricKey(metric)) continue;
        const prior = totals.get(metric);
        totals.set(metric, [metric, (prior?.[1] ?? 0) + count, (prior?.[2] ?? 0) + browsers]);
      }
    }
    result.set(day, [...totals.values()]);
  }
  return result;
}

export async function cleanupExpiredUsage(store: BlobStore, now: number): Promise<void> {
  const oldest = dayAt(now, 1 - USAGE_RETENTION_DAYS);
  const expired: string[] = [];
  for (const { key, uploadedAt } of await store.list(PREFIX)) {
    const day = SHARD_KEY.exec(key)?.[1];
    if (!day) continue;
    if (day < oldest) {
      expired.push(key);
    } else {
      // After the reporting and invocation windows, an upload can only be
      // a finalisation. Later cron runs can skip the Blob read for those shards.
      const finaliseAt = Date.parse(day) + 2 * DAY_MS + INVOCATION_GRACE_MS;
      if (now < finaliseAt || uploadedAt >= finaliseAt) continue;
      const current = await store.get(key);
      if (!current) continue;
      const shard = readShard(current.body);
      if (shard.receipts.length === 0) continue;
      await store.put(key, encoder.encode(JSON.stringify({ ...shard, receipts: [] })), {
        ifMatch: current.etag,
      });
    }
  }
  await store.del(expired);
}
