import { jsonValueSchema, type JsonValue } from './protocol';
import {
  AI_RELAY_PROTOCOL_VERSION,
  relayEnvelopeSchema,
  relayPublicKeySchema,
  type RelayEnvelope,
} from './relayProtocol';

export const AI_RELAY_AAD = 'lacuna-ai-relay-v1';
export const AI_RELAY_NONCE_BYTES = 12;

const ECDH_ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' } as const;
const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_BITS = 256;
const GCM_TAG_BITS = 128;
const AAD_BYTES = new TextEncoder().encode(AI_RELAY_AAD);

export interface RelayKeyPair {
  /** Raw uncompressed 65-byte P-256 public key, encoded as unpadded base64url. */
  publicKey: string;
  /** Exportable PKCS8 private key, encoded as unpadded base64url for reload persistence. */
  privateKey: string;
}

export class RelayCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayCryptoError';
  }
}

export class RelayCryptoFormatError extends RelayCryptoError {
  constructor(message: string) {
    super(message);
    this.name = 'RelayCryptoFormatError';
  }
}

export class RelayCryptoDecryptError extends RelayCryptoError {
  constructor() {
    super('The encrypted AI relay message could not be authenticated.');
    this.name = 'RelayCryptoDecryptError';
  }
}

export async function createRelayKeyPair(): Promise<RelayKeyPair> {
  const pair = (await crypto.subtle.generateKey(ECDH_ALGORITHM, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const [rawPublicKey, pkcs8PrivateKey] = await Promise.all([
    crypto.subtle.exportKey('raw', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ]);
  return {
    publicKey: base64UrlEncode(new Uint8Array(rawPublicKey)),
    privateKey: base64UrlEncode(new Uint8Array(pkcs8PrivateKey)),
  };
}

export async function deriveRelayEncryptionKey(
  privateKeyPkcs8: string,
  peerPublicKeyRaw: string,
): Promise<CryptoKey> {
  const publicKeyResult = relayPublicKeySchema.safeParse(peerPublicKeyRaw);
  if (!publicKeyResult.success) {
    throw new RelayCryptoFormatError('The AI relay public key is invalid.');
  }
  const privateKeyBytes = decodePrivateKey(privateKeyPkcs8);
  try {
    const [privateKey, publicKey] = await Promise.all([
      crypto.subtle.importKey('pkcs8', asBufferSource(privateKeyBytes), ECDH_ALGORITHM, false, [
        'deriveBits',
      ]),
      crypto.subtle.importKey(
        'raw',
        asBufferSource(base64UrlDecode(publicKeyResult.data)),
        ECDH_ALGORITHM,
        false,
        [],
      ),
    ]);
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      AES_KEY_BITS,
    );
    return crypto.subtle.importKey('raw', sharedSecret, AES_ALGORITHM, false, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    throw new RelayCryptoFormatError('The AI relay key material is invalid.');
  }
}

export async function sealRelayJson(key: CryptoKey, value: JsonValue): Promise<RelayEnvelope> {
  const parsed = jsonValueSchema.safeParse(value);
  if (!parsed.success)
    throw new RelayCryptoFormatError('The AI relay payload must be strict JSON.');
  const nonce = randomBytes(AI_RELAY_NONCE_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(parsed.data));
  let encrypted: ArrayBuffer;
  try {
    encrypted = await crypto.subtle.encrypt(gcmParameters(nonce), key, asBufferSource(plaintext));
  } catch {
    throw new RelayCryptoFormatError('The AI relay encryption key is invalid.');
  }
  return {
    version: AI_RELAY_PROTOCOL_VERSION,
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(new Uint8Array(encrypted)),
  };
}

export async function openRelayJson(key: CryptoKey, envelope: unknown): Promise<JsonValue> {
  const parsedEnvelope = relayEnvelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) {
    throw new RelayCryptoFormatError('The AI relay envelope is invalid.');
  }
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      gcmParameters(base64UrlDecode(parsedEnvelope.data.nonce)),
      key,
      asBufferSource(base64UrlDecode(parsedEnvelope.data.ciphertext)),
    );
  } catch {
    throw new RelayCryptoDecryptError();
  }
  try {
    const value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
    ) as unknown;
    const parsedValue = jsonValueSchema.safeParse(value);
    if (!parsedValue.success) throw new Error('invalid JSON value');
    return parsedValue.data;
  } catch {
    throw new RelayCryptoFormatError('The decrypted AI relay payload is invalid.');
  }
}

function gcmParameters(nonce: Uint8Array): AesGcmParams {
  return {
    name: AES_ALGORITHM,
    iv: asBufferSource(nonce),
    additionalData: asBufferSource(AAD_BYTES),
    tagLength: GCM_TAG_BITS,
  };
}

function decodePrivateKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RelayCryptoFormatError('The AI relay private key is invalid.');
  }
  try {
    return base64UrlDecode(value);
  } catch {
    throw new RelayCryptoFormatError('The AI relay private key is invalid.');
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
