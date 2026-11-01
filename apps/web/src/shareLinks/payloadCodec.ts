/** Relay transport envelope; ordinary .lacuna files remain unchanged. */
export const SHARE_PAYLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const MAX_DECOMPRESSED_SHARE_BYTES = 64 * 1024 * 1024;
const MAGIC = new TextEncoder().encode('LACUNA-SHARE:');
const VERSION = 1;
const UPDATE_MESSAGE = 'Update Lacuna to read this compressed share link.';

export class SharePayloadError extends Error {}

function compressionStream(decode: boolean): TransformStream<BufferSource, Uint8Array> {
  try {
    return decode ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw');
  } catch {
    throw new SharePayloadError(UPDATE_MESSAGE);
  }
}

export function assertSharePayloadSize(byteLength: number): void {
  if (byteLength > SHARE_PAYLOAD_MAX_BYTES) {
    throw new SharePayloadError(
      'This course is too large for a share link after compression. Send the course file instead.',
    );
  }
}

function assertDecodedSize(byteLength: number): void {
  if (byteLength > MAX_DECOMPRESSED_SHARE_BYTES)
    throw new SharePayloadError(
      'The share payload exceeds the safe 64 MB decompressed limit. Send the course file instead.',
    );
}

async function transform(
  bytes: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
  limit: number,
  limitMessage: string,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Read concurrently with writing: compression streams apply backpressure.
  const writing = (async () => {
    await writer.write(bytes as BufferSource);
    await writer.close();
  })();
  // Cancellation can reject the writer before the reader's error is handled.
  void writing.catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new SharePayloadError(limitMessage);
      }
      chunks.push(value);
    }
    await writing;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Preserve small courses byte-for-byte for installed clients without this codec. */
export async function encodeSharePayload(bytes: Uint8Array): Promise<Uint8Array> {
  assertDecodedSize(bytes.byteLength);
  if (bytes.byteLength <= SHARE_PAYLOAD_MAX_BYTES) return bytes;
  const compressed = await transform(
    bytes,
    compressionStream(false),
    SHARE_PAYLOAD_MAX_BYTES - MAGIC.length - 1,
    'This course is too large for a share link after compression. Send the course file instead.',
  );
  const result = new Uint8Array(MAGIC.length + 1 + compressed.length);
  result.set(MAGIC);
  result[MAGIC.length] = VERSION;
  result.set(compressed, MAGIC.length + 1);
  assertSharePayloadSize(result.byteLength);
  return result;
}

/** Recognise transport bytes independently of the separately written manifest. */
export async function decodeSharePayload(bytes: Uint8Array): Promise<Uint8Array> {
  assertSharePayloadSize(bytes.byteLength);
  if (!MAGIC.every((value, index) => bytes[index] === value)) return bytes;
  if (bytes[MAGIC.length] !== VERSION) throw new SharePayloadError(UPDATE_MESSAGE);
  return transform(
    bytes.subarray(MAGIC.length + 1),
    compressionStream(true),
    MAX_DECOMPRESSED_SHARE_BYTES,
    'The share payload exceeds the safe 64 MB decompressed limit.',
  );
}
