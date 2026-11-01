import { z } from 'zod';
import { PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_MAX, PBKDF2_ITERATIONS_MIN } from '../sync/crypto';
import { isoDayStartMs } from '../../../relay/shared/insights/index';
import { insightsRecipientSchema as recipientSchema, type InsightsRecipient } from './recipient';
export type { InsightsRecipient } from './recipient';
import {
  INSIGHT_MAX_EVIDENCE_BYTES,
  parseInsightEnvelope,
  type InsightEnvelope,
} from '../../../relay/shared/insights/index';
export type { InsightEnvelope } from '../../../relay/shared/insights/index';

// Experimental #600 format. No network or persistence callers yet. Keep the
// teacher's RSA private key out of share payloads and pupil devices.
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
const MAX_PLAINTEXT_BYTES = INSIGHT_MAX_EVIDENCE_BYTES;
const base64 = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/);
const recoverySchema = z
  .object({
    v: z.literal(1),
    recipient: recipientSchema,
    iterations: z.number().int().min(PBKDF2_ITERATIONS_MIN).max(PBKDF2_ITERATIONS_MAX),
    salt: base64(24),
    n: base64(16),
    c: base64(4096),
  })
  .strict();

export type InsightsRecovery = z.infer<typeof recoverySchema>;
export interface InsightsOwner {
  recipient: InsightsRecipient;
  privateKey: CryptoKey;
  recovery: InsightsRecovery;
}
export interface InsightEnvelopeContext {
  shareId: string;
  isoDay: string;
}

export function parseInsightsRecovery(raw: unknown): InsightsRecovery {
  return recoverySchema.parse(raw);
}

/** Generate a course-owner key and an encrypted recovery file; persist nothing. */
export async function createInsightsOwner(
  passphrase: string,
  shareId: string,
): Promise<InsightsOwner> {
  requireShareId(shareId);
  requirePassphrase(passphrase);
  const pair = await crypto.subtle.generateKey(
    {
      ...RSA,
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const recipient = { publicKey: encode(spki), keyId: await fingerprint(spki) };
  const privateBytes = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const header = { v: 1 as const, recipient, iterations: PBKDF2_ITERATIONS, salt: encode(salt) };
    const key = await recoveryKey(passphrase, salt, header.iterations);
    const ciphertext = await crypto.subtle.encrypt(
      gcm(nonce, recoveryAad(header, shareId)),
      key,
      privateBytes,
    );
    const privateKey = await crypto.subtle.importKey('pkcs8', privateBytes, RSA, false, [
      'decrypt',
    ]);
    return {
      recipient,
      privateKey,
      recovery: { ...header, n: encode(nonce), c: encode(ciphertext) },
    };
  } finally {
    new Uint8Array(privateBytes).fill(0);
  }
}

/** Recovery needs both the saved encrypted file and the offline passphrase. */
export async function recoverInsightsOwner(
  raw: unknown,
  passphrase: string,
  shareId: string,
): Promise<InsightsOwner> {
  requireShareId(shareId);
  requirePassphrase(passphrase);
  const recovery = parseInsightsRecovery(raw);
  const publicKey = await importRecipient(recovery.recipient);
  const salt = decode(recovery.salt, 16, 16);
  const nonce = decode(recovery.n, 12, 12);
  const ciphertext = decode(recovery.c, 16, 3072);
  const key = await recoveryKey(passphrase, salt, recovery.iterations);
  const bytes = await crypto.subtle.decrypt(
    gcm(nonce, recoveryAad(recovery, shareId)),
    key,
    ciphertext,
  );
  try {
    const privateKey = await crypto.subtle.importKey('pkcs8', bytes, RSA, false, ['decrypt']);
    // An authenticated recovery file can still contain the wrong private key.
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await crypto.subtle.encrypt(RSA, publicKey, challenge);
    const checked = new Uint8Array(await crypto.subtle.decrypt(RSA, privateKey, wrapped));
    if (checked.length !== challenge.length || checked.some((byte, i) => byte !== challenge[i]))
      throw new Error('The recovered teacher key does not match its public key.');
    return { recipient: recovery.recipient, privateKey, recovery };
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}

/** Hybrid encryption: a fresh AES key per envelope, wrapped to the teacher. */
export async function sealInsightEnvelope(
  recipient: InsightsRecipient,
  plaintext: Uint8Array,
  context: InsightEnvelopeContext,
): Promise<InsightEnvelope> {
  const aad = envelopeAad(context, recipient.keyId);
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES)
    throw new Error('Insights evidence is too large.');
  const publicKey = await importRecipient(recipient);
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP', label: aad },
      publicKey,
      rawKey,
    );
    const ciphertext = await crypto.subtle.encrypt(gcm(nonce, aad), key, copy(plaintext));
    return {
      v: 2,
      s: context.shareId,
      d: context.isoDay,
      k: recipient.keyId,
      x: encode(wrapped),
      n: encode(nonce),
      c: encode(ciphertext),
    };
  } finally {
    rawKey.fill(0);
  }
}

export async function openInsightEnvelope(
  owner: Pick<InsightsOwner, 'recipient' | 'privateKey'>,
  raw: unknown,
  context: InsightEnvelopeContext,
): Promise<Uint8Array> {
  const envelope = parseInsightEnvelope(raw, context);
  const aad = envelopeAad(context, owner.recipient.keyId);
  if (
    envelope.s !== context.shareId ||
    envelope.d !== context.isoDay ||
    envelope.k !== owner.recipient.keyId
  ) {
    throw new Error('The insights envelope belongs to another course, day or teacher key.');
  }
  const nonce = decode(envelope.n, 12, 12);
  const wrapped = decode(envelope.x, 384, 384);
  const ciphertext = decode(envelope.c, 16, MAX_PLAINTEXT_BYTES + 16);
  const rawKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP', label: aad },
    owner.privateKey,
    wrapped,
  );
  try {
    if (rawKey.byteLength !== 32) throw new Error('Invalid insights encryption key.');
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt(gcm(nonce, aad), key, ciphertext));
  } finally {
    new Uint8Array(rawKey).fill(0);
  }
}

async function importRecipient(raw: InsightsRecipient): Promise<CryptoKey> {
  const recipient = recipientSchema.parse(raw);
  const spki = decode(recipient.publicKey, 1, 768);
  if ((await fingerprint(spki)) !== recipient.keyId)
    throw new Error('Invalid teacher key fingerprint.');
  const key = await crypto.subtle.importKey('spki', spki, RSA, false, ['encrypt']);
  if ((key.algorithm as RsaKeyAlgorithm).modulusLength !== 3072)
    throw new Error('Invalid teacher key size.');
  return key;
}

export async function validateInsightsRecipient(raw: unknown): Promise<InsightsRecipient> {
  const recipient = recipientSchema.parse(raw);
  await importRecipient(recipient);
  return recipient;
}

function envelopeAad(context: InsightEnvelopeContext, keyId: string): Uint8Array<ArrayBuffer> {
  requireShareId(context.shareId);
  isoDayStartMs(context.isoDay);
  return text(['lacuna.insights.envelope.v2', context.shareId, context.isoDay, keyId]);
}

function recoveryAad(
  header: Pick<InsightsRecovery, 'recipient' | 'iterations' | 'salt'>,
  shareId: string,
): Uint8Array<ArrayBuffer> {
  return text([
    'lacuna.insights.recovery.v1',
    shareId,
    header.recipient.keyId,
    header.recipient.publicKey,
    header.iterations,
    header.salt,
  ]);
}

async function recoveryKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function gcm(iv: Uint8Array<ArrayBuffer>, additionalData: Uint8Array<ArrayBuffer>): AesGcmParams {
  return { name: 'AES-GCM', iv, additionalData, tagLength: 128 };
}

function requireShareId(shareId: string): void {
  if (!/^[0-9a-f]{32}$/.test(shareId)) throw new Error('Invalid insights share id.');
}

function requirePassphrase(passphrase: string): void {
  if (!passphrase.trim()) throw new Error('A teacher recovery passphrase is required.');
}

function text(parts: (string | number)[]): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(parts));
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function encode(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

function decode(value: string, min: number, max: number): Uint8Array<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  if (bytes.byteLength < min || bytes.byteLength > max || encode(bytes) !== value) {
    throw new Error('Invalid insights encoded bytes.');
  }
  return bytes;
}

async function fingerprint(spki: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', spki);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
