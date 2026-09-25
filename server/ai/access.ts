import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_LIFETIME_SECONDS = 60 * 60;

export interface AiAccessConfiguration {
  credentialHashes: Record<string, string>;
  signingKey: string;
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function loadAccessConfiguration(env: NodeJS.ProcessEnv): AiAccessConfiguration | null {
  if (!env.AI_ACCESS_CREDENTIAL_HASHES || !env.AI_SESSION_SIGNING_KEY || env.AI_SESSION_SIGNING_KEY.length < 32) {
    return null;
  }
  try {
    const entries = JSON.parse(env.AI_ACCESS_CREDENTIAL_HASHES) as unknown;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null;
    const hashes = entries as Record<string, unknown>;
    if (Object.keys(hashes).length === 0 || Object.entries(hashes).some(([id, hash]) =>
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) return null;
    return { credentialHashes: hashes as Record<string, string>, signingKey: env.AI_SESSION_SIGNING_KEY };
  } catch {
    return null;
  }
}

export function exchangeCredential(
  credential: string,
  configuration: AiAccessConfiguration,
  now = Date.now(),
): { token: string; expiresAt: number } | null {
  if (credential.length < 32 || credential.length > 256) return null;
  const digest = createHash('sha256').update(credential).digest('hex');
  const entry = Object.entries(configuration.credentialHashes).find(([, hash]) => equalHex(digest, hash));
  if (!entry) return null;
  const expiresAt = Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS;
  const payload = Buffer.from(JSON.stringify({ id: entry[0], exp: expiresAt })).toString('base64url');
  const signature = createHmac('sha256', configuration.signingKey).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: expiresAt * 1000 };
}

export function verifySessionToken(
  token: string,
  configuration: AiAccessConfiguration,
  now = Date.now(),
): string | null {
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0]!.length > 256 || parts[1]!.length > 64) return null;
  const expected = createHmac('sha256', configuration.signingKey).update(parts[0]!).digest('base64url');
  if (parts[1]!.length !== expected.length || !timingSafeEqual(Buffer.from(parts[1]!), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const { id, exp } = payload as Record<string, unknown>;
    if (typeof id !== 'string' || !(id in configuration.credentialHashes) ||
        typeof exp !== 'number' || !Number.isInteger(exp) || exp <= Math.floor(now / 1000)) return null;
    return id;
  } catch {
    return null;
  }
}
