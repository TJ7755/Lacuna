import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const INSTALLATION_ID = /^[a-f0-9]{64}$/;
const SESSION_LIFETIME_SECONDS = 3600;

export function loadJevSigningKey(env: NodeJS.ProcessEnv): string | null {
  const key = env.AI_SESSION_SIGNING_KEY;
  return key && key.length >= 32 ? key : null;
}

export function jevInstallationId(credential: unknown): string | null {
  return typeof credential === 'string' && INSTALLATION_ID.test(credential)
    ? createHash('sha256').update(credential).digest('hex')
    : null;
}

export function createJevSession(id: string, key: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS;
  const payload = Buffer.from(JSON.stringify({ purpose: 'jev-beta', id, exp: expiresAt })).toString(
    'base64url',
  );
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: expiresAt * 1000 };
}

export function verifyJevSession(token: string, key: string, now = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0]!.length > 256 || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!))
    return null;
  const expected = createHmac('sha256', key).update(parts[0]!).digest('base64url');
  if (
    parts[1]!.length !== expected.length ||
    !timingSafeEqual(Buffer.from(parts[1]!), Buffer.from(expected))
  )
    return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const { purpose, id, exp } = value as Record<string, unknown>;
    return purpose === 'jev-beta' &&
      typeof id === 'string' &&
      INSTALLATION_ID.test(id) &&
      typeof exp === 'number' &&
      Number.isInteger(exp) &&
      exp > Math.floor(now / 1000)
      ? id
      : null;
  } catch {
    return null;
  }
}

export function loadJevMaintainerIds(value: string | undefined): Set<string> | null {
  if (value === undefined) return new Set();
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) &&
      ids.every((id) => typeof id === 'string' && INSTALLATION_ID.test(id))
      ? new Set(ids)
      : null;
  } catch {
    return null;
  }
}
