import { createHash } from 'node:crypto';
import { canonicalEtag, type BlobStore } from './store.js';

// Persisted per-address limiter for anonymous mints and AI pairing. Counters live in the same
// blob store as the slots, so they survive isolate recycling and are shared by every instance.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_CAS_ATTEMPTS = 5;
export const RATE_KEY_RE = /^ai-rate\/(?:pairing|channel-mint|share-mint)\/[0-9a-f]{64}$/;

export type RateScope = 'pairing' | 'channel-mint' | 'share-mint';

interface RateRecord {
  version: 1;
  count: number;
  resetAt: number;
}

export const CLEARED_RATE_RECORD: RateRecord = { version: 1, count: 0, resetAt: 0 };

export type RatePermit = 'allowed' | 'limited' | 'unavailable';

export async function consumeRatePermit(
  store: BlobStore,
  request: Request,
  now: number,
  scope: RateScope,
): Promise<RatePermit> {
  const key = rateKey(scope, trustedClientAddress(request));

  for (let attempt = 0; attempt < RATE_LIMIT_CAS_ATTEMPTS; attempt += 1) {
    const stored = await store.get(key);
    if (!stored) {
      const created = await store.put(
        key,
        encodeRateRecord({
          version: 1,
          count: 1,
          resetAt: now + RATE_WINDOW_MS,
        }),
        { exclusive: true },
      );
      if (created.ok) return 'allowed';
      continue;
    }

    const record = decodeRateRecord(stored.body);
    const etag = canonicalEtag(stored.etag);
    if (!record || etag === '') return 'unavailable';
    if (now < record.resetAt && record.count >= RATE_LIMIT) return 'limited';

    const next: RateRecord =
      now >= record.resetAt
        ? { version: 1, count: 1, resetAt: now + RATE_WINDOW_MS }
        : { ...record, count: record.count + 1 };
    const updated = await store.put(key, encodeRateRecord(next), { ifMatch: etag });
    if (updated.ok) return 'allowed';
  }

  return 'unavailable';
}

function trustedClientAddress(request: Request): string {
  const vercelAddress = firstForwardedAddress(request.headers.get('x-vercel-forwarded-for'));
  if (vercelAddress) return vercelAddress;

  // Vercel documents x-vercel-forwarded-for (and x-real-ip) as set by its edge, overwriting any
  // client-supplied value, whereas x-forwarded-for can carry client-chosen leading hops. See
  // https://vercel.com/docs/headers/request-headers. Vercel always supplies x-vercel-forwarded-for. Fallback headers are accepted only for the
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

function rateKey(scope: RateScope, address: string): string {
  const digest = createHash('sha256')
    .update(`lacuna-${scope === 'pairing' ? 'ai-pairing' : scope}-ip-v1\0`, 'utf8')
    .update(address, 'utf8')
    .digest('hex');
  return `ai-rate/${scope}/${digest}`;
}

export function encodeRateRecord(record: RateRecord): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}

export function decodeRateRecord(bytes: Uint8Array): RateRecord | null {
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
      value.count > RATE_LIMIT ||
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
