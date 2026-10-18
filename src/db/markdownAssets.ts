import Dexie from 'dexie';
import { db } from './schema';
import type { MediaAsset } from './types';
import { assetUrl, base64ToBytes, blobToArrayBuffer, sha256Blob, toBlob } from './assets';
import { compressImageBlob } from '../utils/compressImage';

const DATA_IMAGE_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const ASSET_RE = /lacuna-asset:\/\/([a-f0-9]{64})/gi;

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(null);
    };
    img.src = URL.createObjectURL(blob);
  });
}

async function assetFromDataUri(uri: string, mimeType: string): Promise<MediaAsset> {
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const bytes = base64ToBytes(base64);
  const blob = toBlob(bytes, mimeType);

  // Compress image assets so the database never stores an uncompressed base64 payload.
  if (mimeType.startsWith('image/')) {
    try {
      const compressed = await compressImageBlob(blob);
      const hash = await sha256Blob(compressed.blob);
      return {
        hash,
        blob: new Uint8Array(await blobToArrayBuffer(compressed.blob)),
        mimeType: compressed.blob.type || mimeType,
        kind: 'image',
        width: compressed.width,
        height: compressed.height,
        createdAt: Date.now(),
      };
    } catch {
      // If compression fails, try to read dimensions from the original blob.
      const dims = await getImageDimensions(blob);
      if (dims) {
        const hash = await sha256Blob(blob);
        return {
          hash,
          blob: new Uint8Array(await blobToArrayBuffer(blob)),
          mimeType,
          kind: 'image',
          width: dims.width,
          height: dims.height,
          createdAt: Date.now(),
        };
      }
    }
  }

  const hash = await sha256Blob(blob);
  return {
    hash,
    blob: new Uint8Array(await blobToArrayBuffer(blob)),
    mimeType,
    kind: mimeType.startsWith('audio/') ? 'audio' : 'image',
    width: 0,
    height: 0,
    createdAt: Date.now(),
  };
}

export async function extractMarkdownAssets(
  markdown: string,
  putAsset: (asset: MediaAsset) => Promise<unknown>,
  knownHashes?: Set<string>,
): Promise<string> {
  const replacements: { from: string; to: string }[] = [];
  const seen = new Set<string>();

  // Handle data URIs: extract, compress and store as assets.
  for (const match of markdown.matchAll(DATA_IMAGE_RE)) {
    const from = match[0];
    if (seen.has(from)) continue;
    seen.add(from);
    const asset = await Dexie.waitFor(assetFromDataUri(from, match[1]));
    await putAsset(asset);
    replacements.push({ from, to: assetUrl(asset.hash) });
  }

  // Normalise lacuna-asset:// references: verify each referenced hash exists in the
  // asset store and replace any that are missing with a broken-image placeholder.
  for (const match of markdown.matchAll(ASSET_RE)) {
    const from = match[0];
    if (seen.has(from)) continue;
    seen.add(from);
    const hash = match[1].toLowerCase();
    if (knownHashes?.has(hash)) continue;
    const existing = await db.assets.get(hash);
    if (!existing) {
      replacements.push({ from, to: MISSING_ASSET_SVG });
    }
  }

  return replacements.reduce((text, r) => text.replaceAll(r.from, r.to), markdown);
}

const MISSING_ASSET_SVG =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iMTIiIHk9IjE2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTk5Ij5Mb3N0IGltYWdlPC90ZXh0Pjwvc3ZnPg==';
