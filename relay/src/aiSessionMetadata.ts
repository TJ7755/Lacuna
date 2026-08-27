const SESSION_ID_RE = /^[A-HJ-KM-NP-TV-Z2-9]{20}$/;
const PUBLIC_KEY_RE = /^[A-Za-z0-9_-]{80,100}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export interface AiSessionMetadata {
  version: 1;
  sessionId: string;
  browserPublicKey: string;
  browserTokenHash: string;
  createdAt: number;
  pairingExpiresAt: number;
  terminalPublicKey?: string;
  terminalTokenHash?: string;
  client?: { name: string; version?: string };
  claimedAt?: number;
  expiresAt?: number;
}

export function readAiSessionExpiry(bytes: Uint8Array, expectedSessionId: string): number | null {
  const metadata = decodeAiSessionMetadata(bytes);
  if (!metadata || metadata.sessionId !== expectedSessionId) return null;
  return metadata.expiresAt ?? metadata.pairingExpiresAt;
}

export function decodeAiSessionMetadata(bytes: Uint8Array): AiSessionMetadata | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isObject(value)) return null;
    const allowedKeys = new Set([
      'version',
      'sessionId',
      'browserPublicKey',
      'browserTokenHash',
      'createdAt',
      'pairingExpiresAt',
      'terminalPublicKey',
      'terminalTokenHash',
      'client',
      'claimedAt',
      'expiresAt',
    ]);
    if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
    if (
      value.version !== 1 ||
      typeof value.sessionId !== 'string' ||
      !SESSION_ID_RE.test(value.sessionId) ||
      !isPublicKey(value.browserPublicKey) ||
      typeof value.browserTokenHash !== 'string' ||
      !TOKEN_RE.test(value.browserTokenHash) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.pairingExpiresAt) ||
      value.pairingExpiresAt <= value.createdAt
    )
      return null;

    const claimed = [
      value.terminalPublicKey,
      value.terminalTokenHash,
      value.client,
      value.claimedAt,
      value.expiresAt,
    ];
    if (claimed.every((field) => field === undefined)) {
      return {
        version: 1,
        sessionId: value.sessionId,
        browserPublicKey: value.browserPublicKey,
        browserTokenHash: value.browserTokenHash,
        createdAt: value.createdAt,
        pairingExpiresAt: value.pairingExpiresAt,
      };
    }
    if (
      !isPublicKey(value.terminalPublicKey) ||
      typeof value.terminalTokenHash !== 'string' ||
      !TOKEN_RE.test(value.terminalTokenHash) ||
      !isClient(value.client) ||
      !isTimestamp(value.claimedAt) ||
      !isTimestamp(value.expiresAt) ||
      value.claimedAt < value.createdAt ||
      value.expiresAt <= value.claimedAt
    )
      return null;
    return {
      version: 1,
      sessionId: value.sessionId,
      browserPublicKey: value.browserPublicKey,
      browserTokenHash: value.browserTokenHash,
      createdAt: value.createdAt,
      pairingExpiresAt: value.pairingExpiresAt,
      terminalPublicKey: value.terminalPublicKey,
      terminalTokenHash: value.terminalTokenHash,
      client: value.client,
      claimedAt: value.claimedAt,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

function isPublicKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    PUBLIC_KEY_RE.test(value) &&
    Buffer.from(value, 'base64url').byteLength === 65
  );
}

function isClient(value: unknown): value is { name: string; version?: string } {
  return (
    isObject(value) &&
    Object.keys(value).every((key) => key === 'name' || key === 'version') &&
    boundedText(value.name, 100) &&
    (value.version === undefined || boundedText(value.version, 100))
  );
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
