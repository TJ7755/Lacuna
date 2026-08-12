// Transport-only share-code encoding. This module is deliberately independent
// of the database and payload validator so the share worker does not bundle the
// application's repository or mathjs-backed item validation.

import { bytesToBase45, base45ToBytes } from './base45';

const PREFIX_BASE45_COMPRESSED = 'LAC2';
const PREFIX_BASE45_PLAIN = 'LAC3';
const PREFIX_COMPRESSED = 'LAC1';
const PREFIX_PLAIN = 'LAC0';
const MAX_SHARE_BYTES = 5 * 1024 * 1024;
const canCompress = typeof CompressionStream !== 'undefined';
const canDecompress = typeof DecompressionStream !== 'undefined';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
  maxBytes?: number,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource);
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel();
        throw new Error('Share code is too large to decode safely.');
      }
      chunks.push(value);
    }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function encodeShareCode(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress) {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw'));
    return PREFIX_COMPRESSED + bytesToBase64(deflated);
  }
  return PREFIX_PLAIN + bytesToBase64(bytes);
}

export async function encodeShareQrCode(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress) {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw'));
    return PREFIX_BASE45_COMPRESSED + bytesToBase45(deflated);
  }
  return PREFIX_BASE45_PLAIN + bytesToBase45(bytes);
}

export async function decodeShareCode(code: string): Promise<unknown> {
  const trimmed = code.trim();
  let bytes: Uint8Array;

  if (trimmed.startsWith(PREFIX_BASE45_COMPRESSED)) {
    if (!canDecompress) throw new Error('This browser cannot read compressed share codes.');
    const compressed = base45ToBytes(trimmed.slice(PREFIX_BASE45_COMPRESSED.length));
    if (compressed.length > MAX_SHARE_BYTES) throw new Error('Share code is too large to decode safely.');
    bytes = await pipeThrough(compressed, new DecompressionStream('deflate-raw'), MAX_SHARE_BYTES);
  } else if (trimmed.startsWith(PREFIX_BASE45_PLAIN)) {
    bytes = base45ToBytes(trimmed.slice(PREFIX_BASE45_PLAIN.length));
    if (bytes.length > MAX_SHARE_BYTES) throw new Error('Share code is too large to decode safely.');
  } else {
    const stripped = trimmed.replace(/\s+/g, '');
    if (stripped.startsWith(PREFIX_COMPRESSED)) {
      if (!canDecompress) throw new Error('This browser cannot read compressed share codes.');
      const compressed = base64ToBytes(stripped.slice(PREFIX_COMPRESSED.length));
      if (compressed.length > MAX_SHARE_BYTES) throw new Error('Share code is too large to decode safely.');
      bytes = await pipeThrough(compressed, new DecompressionStream('deflate-raw'), MAX_SHARE_BYTES);
    } else if (stripped.startsWith(PREFIX_PLAIN)) {
      bytes = base64ToBytes(stripped.slice(PREFIX_PLAIN.length));
      if (bytes.length > MAX_SHARE_BYTES) throw new Error('Share code is too large to decode safely.');
    } else {
      throw new Error('That does not look like a Lacuna share code.');
    }
  }

  if (bytes.length > MAX_SHARE_BYTES) throw new Error('Share code is too large to decode safely.');
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The share code is corrupted and could not be read.');
  }
}
