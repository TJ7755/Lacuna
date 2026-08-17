// Sync crypto (P2). Pure WebCrypto; persists nothing; knows nothing of
// snapshots, the relay, or Dexie. One 256-bit channel key encrypts `state`.
// The passphrase path wraps that same key (and the write token) into `keybag`.
//
// Gated by Arc 8 §7: this file needs /security-review and a human read of the
// diff before it touches a real channel. Incorrect nonce or KDF handling
// produces code that passes every test and is broken.

export const CHANNEL_KEY_BYTES = 32;
export const NONCE_BYTES = 12;
export const SALT_BYTES = 16;
export const FORMAT_VERSION = 1;
export const GCM_TAG_BITS = 128;
export const GCM_TAG_BYTES = 16;
export const KEY_CONFIRMATION_BYTES = 16;
export const KDF_ID_PBKDF2_SHA256 = 1;
// 256-bit key-encryption key derived from the passphrase. The same length as
// the channel key for AES-GCM, but distinct material.
export const KEK_BYTES = 32;

// PBKDF2_ITERATIONS is the wrap constant. It may rise later when OWASP
// raises the PBKDF2-HMAC-SHA-256 recommendation.
//
// PBKDF2_ITERATIONS_MIN is the unwrap floor. It stays at 600 000
// permanently, even after the wrap constant rises. Raising the floor
// alongside the constant would make every earlier keybag fail to unwrap
// and would destroy the passphrase recovery path.
//
// PBKDF2_ITERATIONS_MAX is unwrap-DoS protection: a tampered header must
// not be able to ask this device to run an unbounded derivation. Keep a
// bounded migration headroom, then re-measure on the slowest supported phone
// before raising either the wrap constant or this cap.
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_ITERATIONS_MIN = 600_000;
export const PBKDF2_ITERATIONS_MAX = PBKDF2_ITERATIONS * 4;

const CHANNEL_ID_RE = /^[0-9a-f]{32}$/;
const WRITE_TOKEN_RE = /^[0-9a-f]{64}$/;
const WRITE_TOKEN_BYTES = 64;

const STATE_AAD_PREFIX = 'lacuna.sync.v1/state/';
const KEYBAG_AAD_PREFIX = 'lacuna.sync.v1/keybag/';

// state:  version (1) || nonce (12) || ciphertext+tag
const STATE_MIN_BYTES = 1 + NONCE_BYTES + GCM_TAG_BYTES;

// keybag: version (1) || kdf (1) || iterations (4) || salt (16) ||
//         confirm (16) || nonce (12) || ciphertext+tag
const KEYBAG_HEADER_BYTES = 1 + 1 + 4 + SALT_BYTES + KEY_CONFIRMATION_BYTES + NONCE_BYTES;
const KEYBAG_PLAINTEXT_BYTES = CHANNEL_KEY_BYTES + WRITE_TOKEN_BYTES;
export const KEYBAG_MIN_BYTES = KEYBAG_HEADER_BYTES + KEYBAG_PLAINTEXT_BYTES + GCM_TAG_BYTES;
export const KEYBAG_MAX_BYTES = KEYBAG_MIN_BYTES;

const KEYBAG_OFFSET_KDF = 1;
export const KEYBAG_OFFSET_ITERATIONS = 2;
export const KEYBAG_OFFSET_SALT = 6;
export const KEYBAG_OFFSET_CONFIRM = 22;
export const KEYBAG_OFFSET_NONCE = 38;
const KEYBAG_OFFSET_CIPHERTEXT = 50;

export class SyncCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncCryptoError';
  }
}

export class SyncCryptoVersionError extends SyncCryptoError {
  readonly kind = 'version' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SyncCryptoVersionError';
  }
}

export class SyncCryptoPassphraseError extends SyncCryptoError {
  readonly kind = 'passphrase' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SyncCryptoPassphraseError';
  }
}

export class SyncCryptoCorruptError extends SyncCryptoError {
  readonly kind = 'corrupt' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SyncCryptoCorruptError';
  }
}

/** 256-bit channel key, generated once on the first device. */
export function generateChannelKey(): Uint8Array {
  return randomBytes(CHANNEL_KEY_BYTES);
}

export async function sealState(
  channelKey: Uint8Array,
  plaintext: Uint8Array,
  context: { channelId: string },
): Promise<Uint8Array> {
  const channelId = requireChannelId(context.channelId);
  const key = requireChannelKey(channelKey);
  const plain = copyBytes(plaintext);
  // Fresh random 96-bit nonce on every seal. A counter would rewind if a
  // device restored from backup; random nonces do not care about restore,
  // clone, or two writers. NIST SP 800-38D limits one key to 2^32 random
  // 96-bit IVs; a personal channel will not approach that.
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await aesGcmSeal(key, nonce, plain, aadFor('state', channelId));
  return concatBytes(Uint8Array.of(FORMAT_VERSION), nonce, ciphertext);
}

export async function openState(
  channelKey: Uint8Array,
  blob: Uint8Array,
  context: { channelId: string },
): Promise<Uint8Array> {
  const channelId = requireChannelId(context.channelId);
  const key = requireChannelKey(channelKey);
  const bytes = copyBytes(blob);
  assertVersion(bytes);
  if (bytes.byteLength < STATE_MIN_BYTES) {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }
  const nonce = bytes.subarray(1, 1 + NONCE_BYTES);
  const ciphertext = bytes.subarray(1 + NONCE_BYTES);
  return aesGcmOpen(key, nonce, ciphertext, aadFor('state', channelId));
}

/**
 * Wrap the channel key and write token under a passphrase-derived KEK.
 *
 * The resulting blob is stored in the `keybag` slot. GET /c/:id/:slot is
 * deliberately unauthenticated: anyone who knows the channel id can fetch
 * this blob and brute-force the passphrase offline. PBKDF2 at the wrap
 * iteration count is meaningful against a strong passphrase and nearly
 * worthless against a short PIN or a single dictionary word.
 *
 * Passphrase strength is therefore load-bearing, not advisory. It is P6's
 * responsibility and is not optional. This module enforces only that the
 * passphrase is non-empty.
 */
export async function wrapKeybag(
  channelKey: Uint8Array,
  passphrase: string,
  writeToken: string,
  context: { channelId: string },
): Promise<Uint8Array> {
  const channelId = requireChannelId(context.channelId);
  const key = requireChannelKey(channelKey);
  const normalised = requirePassphrase(passphrase);
  const token = requireWriteToken(writeToken);
  const tokenBytes = utf8(token);

  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const { kek, confirmation } = await deriveKek(normalised, salt, PBKDF2_ITERATIONS);
  const plaintext = concatBytes(key, tokenBytes);
  const ciphertext = await aesGcmSeal(kek, nonce, plaintext, aadFor('keybag', channelId));

  const blob = new Uint8Array(KEYBAG_HEADER_BYTES + ciphertext.byteLength);
  blob[0] = FORMAT_VERSION;
  blob[KEYBAG_OFFSET_KDF] = KDF_ID_PBKDF2_SHA256;
  writeUint32BE(blob, KEYBAG_OFFSET_ITERATIONS, PBKDF2_ITERATIONS);
  blob.set(salt, KEYBAG_OFFSET_SALT);
  blob.set(confirmation, KEYBAG_OFFSET_CONFIRM);
  blob.set(nonce, KEYBAG_OFFSET_NONCE);
  blob.set(ciphertext, KEYBAG_OFFSET_CIPHERTEXT);
  return blob;
}

export async function unwrapKeybag(
  blob: Uint8Array,
  passphrase: string,
  context: { channelId: string },
): Promise<{ channelKey: Uint8Array; writeToken: string }> {
  const channelId = requireChannelId(context.channelId);
  const normalised = requirePassphrase(passphrase);
  const bytes = copyBytes(blob);
  assertVersion(bytes);
  if (bytes.byteLength < KEYBAG_MIN_BYTES || bytes.byteLength > KEYBAG_MAX_BYTES) {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }
  if (bytes[KEYBAG_OFFSET_KDF] !== KDF_ID_PBKDF2_SHA256) {
    throw new SyncCryptoVersionError('This sync blob uses an unsupported format.');
  }
  const iterations = readUint32BE(bytes, KEYBAG_OFFSET_ITERATIONS);
  if (iterations < PBKDF2_ITERATIONS_MIN || iterations > PBKDF2_ITERATIONS_MAX) {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }

  const salt = bytes.subarray(KEYBAG_OFFSET_SALT, KEYBAG_OFFSET_CONFIRM);
  const storedConfirm = bytes.subarray(KEYBAG_OFFSET_CONFIRM, KEYBAG_OFFSET_NONCE);
  const nonce = bytes.subarray(KEYBAG_OFFSET_NONCE, KEYBAG_OFFSET_CIPHERTEXT);
  const ciphertext = bytes.subarray(KEYBAG_OFFSET_CIPHERTEXT);

  const { kek, confirmation } = await deriveKek(normalised, salt, iterations);
  // A bit-flip in the stored salt or iteration count produces the wrong
  // KEK and therefore a passphrase error. A tampered header reads as a
  // wrong passphrase. That is a residual misreport: an honest mistype and
  // a truncated-or-edited header are indistinguishable to the caller.
  if (!constantTimeEqual(storedConfirm, confirmation)) {
    throw new SyncCryptoPassphraseError('The passphrase is incorrect.');
  }

  const plain = await aesGcmOpen(kek, nonce, ciphertext, aadFor('keybag', channelId));
  if (plain.byteLength !== KEYBAG_PLAINTEXT_BYTES) {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }

  const channelKey = copyBytes(plain.subarray(0, CHANNEL_KEY_BYTES));
  let writeToken: string;
  try {
    writeToken = new TextDecoder('utf-8', { fatal: true }).decode(plain.subarray(CHANNEL_KEY_BYTES));
  } catch {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }
  requireWriteToken(writeToken);
  return { channelKey, writeToken };
}

function requireChannelId(channelId: string): string {
  if (!CHANNEL_ID_RE.test(channelId)) {
    throw new SyncCryptoCorruptError('The channel id is invalid.');
  }
  return channelId;
}

function requireWriteToken(writeToken: string): string {
  if (!WRITE_TOKEN_RE.test(writeToken)) {
    throw new SyncCryptoCorruptError('The write token is invalid.');
  }
  return writeToken;
}

function requireChannelKey(channelKey: Uint8Array): Uint8Array {
  if (channelKey.byteLength !== CHANNEL_KEY_BYTES) {
    throw new SyncCryptoCorruptError('The channel key is the wrong length.');
  }
  return copyBytes(channelKey);
}

function requirePassphrase(passphrase: string): string {
  if (passphrase.length === 0) {
    throw new SyncCryptoPassphraseError('The passphrase is empty.');
  }
  return passphrase.normalize('NFC');
}

function assertVersion(bytes: Uint8Array): void {
  if (bytes.byteLength < 1) {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }
  if (bytes[0] !== FORMAT_VERSION) {
    throw new SyncCryptoVersionError('This sync blob uses an unsupported format.');
  }
}

function aadFor(slot: 'state' | 'keybag', channelId: string): Uint8Array {
  const prefix = slot === 'state' ? STATE_AAD_PREFIX : KEYBAG_AAD_PREFIX;
  return utf8(prefix + channelId);
}

async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<{ kek: Uint8Array; confirmation: Uint8Array }> {
  const material = await crypto.subtle.importKey(
    'raw',
    asBufferSource(utf8(passphrase)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      iterations,
    },
    material,
    (KEK_BYTES + KEY_CONFIRMATION_BYTES) * 8,
  );
  const derived = new Uint8Array(bits);
  return {
    kek: derived.subarray(0, KEK_BYTES),
    // The confirmation is the tail of the same PBKDF2 output, not a
    // function of the KEK, so neither value can be derived from the other.
    confirmation: derived.subarray(KEK_BYTES),
  };
}

async function aesGcmSeal(
  rawKey: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const key = await importAesGcmKey(rawKey, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(gcmParams(nonce, aad), key, asBufferSource(plaintext));
  return new Uint8Array(encrypted);
}

async function aesGcmOpen(
  rawKey: Uint8Array,
  nonce: Uint8Array,
  ciphertextAndTag: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const key = await importAesGcmKey(rawKey, ['decrypt']);
  try {
    const opened = await crypto.subtle.decrypt(gcmParams(nonce, aad), key, asBufferSource(ciphertextAndTag));
    return new Uint8Array(opened);
  } catch {
    throw new SyncCryptoCorruptError('This sync blob is corrupt.');
  }
}

function gcmParams(nonce: Uint8Array, aad: Uint8Array): AesGcmParams {
  return {
    name: 'AES-GCM',
    iv: asBufferSource(nonce),
    additionalData: asBufferSource(aad),
    tagLength: GCM_TAG_BITS,
  };
}

function importAesGcmKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBufferSource(raw), { name: 'AES-GCM' }, false, usages);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(offset, value, false);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, false);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let i = 0; i < left.byteLength; i += 1) {
    difference |= left[i]! ^ right[i]!;
  }
  return difference === 0;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource;
}
