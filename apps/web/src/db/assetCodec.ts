import type { BackupAsset, MediaAsset } from '@lacuna/core/db/types';

export const ASSET_PROTOCOL = 'lacuna-asset://';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new Error('Invalid base64 data in image asset.');
  }
}

/**
 * Ensure a value is a native Blob. fake-indexeddb loses Blob data during
 * structuredClone, so we store images as Uint8Array and convert back to Blob
 * whenever a DOM API (e.g. URL.createObjectURL) needs one.
 */
export function toBlob(data: Blob | Uint8Array | ArrayBuffer, mimeType?: string): Blob {
  if (data instanceof Blob) return data;
  if (data instanceof Uint8Array) {
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    return new Blob([buffer as unknown as BlobPart], { type: mimeType });
  }
  return new Blob([data as ArrayBuffer], { type: mimeType });
}

/**
 * Read a Blob (or Blob-like object) as an ArrayBuffer. Handles native Blobs,
 * ArrayBuffer/TypedArray views, and the custom objects returned by fake-indexeddb
 * which may not be recognised as native Blobs by FileReader.
 */
export async function blobToArrayBuffer(
  blob: Blob | ArrayBufferView | ArrayBuffer,
): Promise<ArrayBuffer> {
  // If it already is an ArrayBuffer, return it directly.
  if (blob instanceof ArrayBuffer) {
    return blob;
  }

  // If it is a TypedArray / Node Buffer, slice its underlying buffer.
  if (ArrayBuffer.isView(blob)) {
    const view = blob as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  // Native Blob with arrayBuffer method.
  if (typeof (blob as Blob).arrayBuffer === 'function') {
    try {
      return await (blob as Blob).arrayBuffer();
    } catch {
      // Fall through to Response-based fallback.
    }
  }

  // Use Response as a robust, spec-compliant way to read any Blob-like body.
  return new Response(blob as BodyInit).arrayBuffer();
}

/**
 * Read a Blob (or Blob-like object) as a UTF-8 text string.
 * Works with native Blobs and the non-native objects returned by fake-indexeddb.
 */
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blobToArrayBuffer(blob));
  return hex(new Uint8Array(digest));
}

export function assetUrl(hash: string): string {
  return `${ASSET_PROTOCOL}${hash}`;
}

// A multiple of three avoids padding between concatenated base64 chunks.
const BACKUP_ASSET_CHUNK_BYTES = 384 * 1024;
// Bound metadata work even when assets contain few or no bytes.
const BACKUP_ASSETS_PER_YIELD = 256;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

/** Encode captured media rows without additional database reads. */
export async function encodeBackupAssets(assets: MediaAsset[]): Promise<BackupAsset[]> {
  const encoded: BackupAsset[] = [];
  let bytesSinceYield = 0;
  let assetsSinceYield = 0;
  for (const asset of assets) {
    if (assetsSinceYield >= BACKUP_ASSETS_PER_YIELD) {
      await yieldToEventLoop();
      bytesSinceYield = 0;
      assetsSinceYield = 0;
    }
    const bytes = new Uint8Array(await blobToArrayBuffer(asset.blob));
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += BACKUP_ASSET_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, offset + BACKUP_ASSET_CHUNK_BYTES);
      if (bytesSinceYield + chunk.length > BACKUP_ASSET_CHUNK_BYTES) {
        await yieldToEventLoop();
        bytesSinceYield = 0;
        assetsSinceYield = 0;
      }
      chunks.push(bytesToBase64(chunk));
      bytesSinceYield += chunk.length;
    }
    encoded.push({
      hash: asset.hash,
      data: chunks.join(''),
      mimeType: asset.mimeType,
      kind: asset.kind,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
    });
    assetsSinceYield += 1;
  }
  return encoded;
}

export function backupAssetToMediaAsset(asset: BackupAsset): MediaAsset {
  return {
    hash: asset.hash,
    blob: base64ToBytes(asset.data),
    mimeType: asset.mimeType,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
  };
}
