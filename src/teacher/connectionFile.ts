import { z } from 'zod';
import { PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_MIN, PBKDF2_ITERATIONS_MAX } from '../sync/crypto';
import { DEFAULT_RELAY_URL, validateRecoveryPassphrase } from '../sync/pairingConfig';

export const GAPS_CONNECTION_FILE_MAX_BYTES = 8192;
const schema = z
  .object({
    kind: z.literal('lacuna.gaps.course-connection'),
    v: z.literal(1),
    shareId: z.string().regex(/^[0-9a-f]{32}$/),
    relayUrl: z.literal(DEFAULT_RELAY_URL),
    courseName: z.string().trim().min(1).max(200),
    iterations: z.number().int().min(PBKDF2_ITERATIONS_MIN).max(PBKDF2_ITERATIONS_MAX),
    salt: z.string(),
    n: z.string(),
    c: z.string(),
  })
  .strict();
export type EncryptedGapsConnection = z.infer<typeof schema>;
export interface GapsCourseConnection {
  shareId: string;
  relayUrl: string;
  courseName: string;
  writeToken: string;
}

export class GapsConnectionFileError extends Error {
  constructor(
    message = 'That is not a supported Gaps course connection file. Export a new file from the course’s Share page in Lacuna.',
  ) {
    super(message);
    this.name = 'GapsConnectionFileError';
  }
}

export function parseGapsConnectionFile(text: string): EncryptedGapsConnection {
  try {
    if (new TextEncoder().encode(text).byteLength > GAPS_CONNECTION_FILE_MAX_BYTES)
      throw new Error();
    const file = schema.parse(JSON.parse(text));
    decode(file.salt, 16);
    decode(file.n, 12);
    decode(file.c, 80);
    return file;
  } catch {
    throw new GapsConnectionFileError();
  }
}

export async function sealGapsConnection(
  connection: GapsCourseConnection,
  passphrase: string,
): Promise<string> {
  const invalid = validateRecoveryPassphrase(passphrase);
  if (invalid) throw new GapsConnectionFileError(invalid);
  if (!/^[0-9a-f]{64}$/.test(connection.writeToken)) throw new GapsConnectionFileError();
  const header = schema.omit({ n: true, c: true }).parse({
    kind: 'lacuna.gaps.course-connection',
    v: 1,
    shareId: connection.shareId,
    relayUrl: connection.relayUrl,
    courseName: connection.courseName,
    iterations: PBKDF2_ITERATIONS,
    salt: encode(crypto.getRandomValues(new Uint8Array(16))),
  });
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, header.salt, header.iterations);
  const bytes = new TextEncoder().encode(connection.writeToken);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad(header), tagLength: 128 },
      key,
      bytes,
    );
    return JSON.stringify(
      { ...header, n: encode(nonce), c: encode(new Uint8Array(ciphertext)) },
      null,
      2,
    );
  } finally {
    bytes.fill(0);
  }
}

/** Only the shared trial relay is supported, so a file cannot redirect this capability elsewhere. */
export async function openGapsConnection(
  raw: EncryptedGapsConnection,
  passphrase: string,
): Promise<GapsCourseConnection> {
  const file = parseGapsConnectionFile(JSON.stringify(raw));
  if (!passphrase.trim())
    throw new GapsConnectionFileError('Enter the connection file’s passphrase.');
  const key = await derive(passphrase, file.salt, file.iterations);
  const bytes = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(file.n, 12), additionalData: aad(file), tagLength: 128 },
      key,
      decode(file.c, 80),
    ),
  );
  try {
    const writeToken = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/^[0-9a-f]{64}$/.test(writeToken)) throw new GapsConnectionFileError();
    return {
      shareId: file.shareId,
      relayUrl: file.relayUrl,
      courseName: file.courseName,
      writeToken,
    };
  } finally {
    bytes.fill(0);
  }
}

function aad(header: Omit<EncryptedGapsConnection, 'n' | 'c'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([
      header.kind,
      header.v,
      header.shareId,
      header.relayUrl,
      header.courseName,
      header.iterations,
      header.salt,
    ]),
  );
}
async function derive(phrase: string, salt: string, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: decode(salt, 16), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function decode(value: string, length: number): Uint8Array<ArrayBuffer> {
  if (value.length > 128) throw new GapsConnectionFileError();
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (bytes.byteLength !== length || encode(bytes) !== value) throw new GapsConnectionFileError();
  return bytes;
}
