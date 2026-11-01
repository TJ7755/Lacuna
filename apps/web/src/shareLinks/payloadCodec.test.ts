import { deflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  decodeSharePayload,
  encodeSharePayload,
  MAX_DECOMPRESSED_SHARE_BYTES,
  SHARE_PAYLOAD_MAX_BYTES,
} from './payloadCodec';
import { getShareBytes } from './client';

it('round trips bytes above 4 MiB through the bounded download path', async () => {
  const original = new TextEncoder().encode('course content '.repeat(400_000));
  const encoded = await encodeSharePayload(original);
  expect(encoded.byteLength).toBeLessThan(SHARE_PAYLOAD_MAX_BYTES);
  const result = await getShareBytes({
    relayUrl: 'https://relay.example',
    shareId: 'a'.repeat(32),
    slot: 'payload',
    fetchImpl: (async () =>
      new Response(encoded as Uint8Array<ArrayBuffer>, {
        headers: { ETag: '"1"' },
      })) as typeof fetch,
  });
  expect(Buffer.compare(Buffer.from(result!.bytes), Buffer.from(original))).toBe(0);
});

it('preserves uncompressed bytes through the threshold for older clients', async () => {
  for (const original of [
    new TextEncoder().encode('{"format":"lacuna-course"}'),
    new Uint8Array(SHARE_PAYLOAD_MAX_BYTES),
  ]) {
    expect(await encodeSharePayload(original)).toBe(original);
    expect(await decodeSharePayload(original)).toBe(original);
  }
});

it('rejects a decompression bomb while reading the stream', async () => {
  const compressed = deflateRawSync(new Uint8Array(MAX_DECOMPRESSED_SHARE_BYTES + 1));
  const envelope = Buffer.concat([Buffer.from('LACUNA-SHARE:'), Buffer.from([1]), compressed]);
  await expect(decodeSharePayload(envelope)).rejects.toThrow(/64 MB decompressed limit/);
});

it('asks for an update when the transport version is unsupported', async () => {
  const envelope = new TextEncoder().encode('LACUNA-SHARE:\u0002future');
  await expect(decodeSharePayload(envelope)).rejects.toThrow('Update Lacuna');
});

it('rejects truncated or corrupt compressed data', async () => {
  await expect(
    decodeSharePayload(new TextEncoder().encode('LACUNA-SHARE:\u0001broken')),
  ).rejects.toThrow();
});

it('refuses an incompressible upload that still exceeds the wire cap', async () => {
  await expect(encodeSharePayload(randomBytes(SHARE_PAYLOAD_MAX_BYTES + 1024))).rejects.toThrow(
    /after compression.*course file instead/,
  );
});

it('asks for an update when raw DEFLATE is unavailable', async () => {
  vi.stubGlobal('DecompressionStream', undefined);
  try {
    await expect(
      decodeSharePayload(new TextEncoder().encode('LACUNA-SHARE:\u0001data')),
    ).rejects.toThrow('Update Lacuna');
  } finally {
    vi.unstubAllGlobals();
  }
});
