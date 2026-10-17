// Session-scoped object-URL cache for image assets.
//
// Resolving lacuna-asset://<hash> to a blob URL on every card render and revoking
// it on unmount is wasteful. This module caches one object URL per hash for the
// lifetime of its LRU entry, revoking URLs on eviction or app teardown.

import { db } from './schema';
import { assetUrl, referencedAssetHashes, toBlob } from './assets';
import { seedArtworkFor } from './seedArtwork';

const MAX_SIZE = 200;

interface LruNode {
  key: string;
  prev: LruNode | null;
  next: LruNode | null;
}

const cache = new Map<string, string>();
const imageSizes = new Map<string, Readonly<{ width: number; height: number }> | undefined>();

/** Render a warmed asset immediately; a miss still uses the asynchronous resolver. */
export function peekCachedAssetUrl(hash: string): string | undefined {
  return cache.get(hash);
}

/** Intrinsic dimensions reserve the image's frame before the browser loads it. */
export function cachedAssetImageSize(url: string) {
  return imageSizes.get(url);
}

/** Decoding also recovers dimensions missing from older imported asset rows. */
export function rememberAssetImageSize(url: string, width: number, height: number): void {
  if (imageSizes.has(url) && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    imageSizes.set(url, { width, height });
  }
}

export function resolveCachedAssetMarkdown(markdown: string): string {
  for (const hash of referencedAssetHashes(markdown)) {
    const url = peekCachedAssetUrl(hash);
    if (url) markdown = markdown.replaceAll(assetUrl(hash), url);
  }
  return markdown;
}
const nodeMap = new Map<string, LruNode>();
let head: LruNode | null = null;
let tail: LruNode | null = null;
const pending = new Map<string, Promise<string | null>>();

function moveToFront(node: LruNode): void {
  if (node === head) return;
  // Detach
  if (node.prev) node.prev.next = node.next;
  if (node.next) node.next.prev = node.prev;
  if (node === tail) tail = node.prev;
  // Prepend
  node.prev = null;
  node.next = head;
  if (head) head.prev = node;
  head = node;
  if (!tail) tail = node;
}

function addFront(key: string): LruNode {
  const node: LruNode = { key, prev: null, next: head };
  if (head) head.prev = node;
  head = node;
  if (!tail) tail = node;
  nodeMap.set(key, node);
  return node;
}

function evictOldest(): void {
  if (!tail) return;
  const oldestKey = tail.key;
  const url = cache.get(oldestKey);
  if (url) {
    URL.revokeObjectURL(url);
    imageSizes.delete(url);
  }
  cache.delete(oldestKey);
  // Detach tail
  const newTail = tail.prev;
  if (newTail) newTail.next = null;
  tail = newTail;
  if (!tail) head = null;
  nodeMap.delete(oldestKey);
}

/**
 * Resolve an asset hash to an object URL, creating and caching one if necessary.
 * Returns null when the asset is not in the database.
 */
export async function resolveAssetUrl(hash: string): Promise<string | null> {
  const cached = cache.get(hash);
  if (cached) {
    const node = nodeMap.get(hash);
    if (node) moveToFront(node);
    return cached;
  }

  const existing = pending.get(hash);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // The Welcome drawings show their themed versions; their stored bytes stay as seeded.
      let blob = seedArtworkFor(hash);
      let size: { width: number; height: number } | undefined;
      if (!blob) {
        const asset = await db.assets.get(hash);
        if (!asset) return null;
        blob = toBlob(asset.blob, asset.mimeType);
        if (typeof asset.width === 'number' && typeof asset.height === 'number' &&
          Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0) {
          size = { width: asset.width, height: asset.height };
        }
      }
      const url = URL.createObjectURL(blob);
      if (cache.size >= MAX_SIZE) evictOldest();
      cache.set(hash, url);
      imageSizes.set(url, size);
      addFront(hash);
      return url;
    } finally {
      pending.delete(hash);
    }
  })();

  pending.set(hash, promise);
  return promise;
}

/**
 * Replace every lacuna-asset:// reference in Markdown with its cached object URL.
 * Does not return URLs for revocation — the cache owns the lifecycle.
 */
export async function resolveAssetMarkdownCached(markdown: string): Promise<string> {
  const hashes = referencedAssetHashes(markdown);
  const urls = await Promise.all(hashes.map((h) => resolveAssetUrl(h)));
  let result = markdown;
  for (let i = 0; i < hashes.length; i++) {
    const url = urls[i];
    if (url) {
      result = result.replaceAll(assetUrl(hashes[i]), url);
    }
  }
  return result;
}

/** Revoke every cached object URL and clear the cache. */
export function revokeAllCachedUrls(): void {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
  imageSizes.clear();
  nodeMap.clear();
  head = null;
  tail = null;
}

/** Test-only cache size probe. */
export function _cacheSizeForTests(): number {
  return cache.size;
}
