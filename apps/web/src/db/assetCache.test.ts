import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  rememberAssetImageSize,
  peekCachedAssetUrl,
  cachedAssetImageSize,
  resolveCachedAssetMarkdown,
  resolveAssetUrl,
  resolveAssetMarkdownCached,
  revokeAllCachedUrls,
  _cacheSizeForTests,
} from './assetCache';

describe('asset object URL cache', () => {
  beforeEach(async () => {
    revokeAllCachedUrls();
    await db.assets.clear();
  });

  it('returns a stable URL for the same hash across multiple calls', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:abc');
    await db.assets.put({
      hash: 'h1',
      blob: new Blob(['x'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 4,
      height: 3,
      createdAt: 0,
    });

    const first = await resolveAssetUrl('h1');
    const second = await resolveAssetUrl('h1');

    expect(first).toBe('blob:abc');
    expect(second).toBe('blob:abc');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    createObjectURL.mockRestore();
  });

  it('keeps cached image dimensions bounded by the same LRU as its URLs', async () => {
    let serial = 0;
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:image-${serial++}`);
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
    try {
      await db.assets.bulkPut(
        Array.from({ length: 201 }, (_, i) => ({
          hash: `image-${i}`,
          blob: new Uint8Array([i]),
          mimeType: 'image/png',
          width: 4000,
          height: 3000,
          createdAt: 0,
        })),
      );
      const firstUrl = (await resolveAssetUrl('image-0'))!;
      expect(peekCachedAssetUrl('image-0')).toBe(firstUrl);
      expect(cachedAssetImageSize(firstUrl)).toEqual({ width: 4000, height: 3000 });
      for (let i = 1; i <= 200; i++) await resolveAssetUrl(`image-${i}`);
      expect(peekCachedAssetUrl('image-0')).toBeUndefined();
      expect(cachedAssetImageSize(firstUrl)).toBeUndefined();
      expect(revokeUrl).toHaveBeenCalledWith(firstUrl);
      const lastUrl = peekCachedAssetUrl('image-200')!;
      expect(cachedAssetImageSize(lastUrl)).toEqual({ width: 4000, height: 3000 });
      revokeAllCachedUrls();
      expect(cachedAssetImageSize(lastUrl)).toBeUndefined();
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it('leaves cold references intact and omits unknown intrinsic dimensions', async () => {
    const hash = 'e'.repeat(64);
    const source = `![Cold](lacuna-asset://${hash})`;
    expect(resolveCachedAssetMarkdown(source)).toBe(source);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:legacy-image');
    try {
      await db.assets.put({
        hash,
        blob: new Uint8Array([1]),
        mimeType: 'image/png',
        width: 0,
        height: 0,
        createdAt: 0,
      });
      const url = (await resolveAssetUrl(hash))!;
      expect(resolveCachedAssetMarkdown(source)).toBe('![Cold](blob:legacy-image)');
      expect(cachedAssetImageSize(url)).toBeUndefined();
      rememberAssetImageSize(url, 3600, 2700);
      expect(cachedAssetImageSize(url)).toEqual({ width: 3600, height: 2700 });
      revokeAllCachedUrls();
      rememberAssetImageSize(url, 3600, 2700);
      expect(cachedAssetImageSize(url)).toBeUndefined();
    } finally {
      createUrl.mockRestore();
    }
  });

  it('returns null when the asset is not in the database', async () => {
    const url = await resolveAssetUrl('missing');
    expect(url).toBeNull();
  });

  it('replaces all lacuna-asset references in Markdown with cached URLs', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached');
    const hash = 'a'.repeat(64);
    await db.assets.put({
      hash,
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      width: 4,
      height: 3,
      createdAt: 0,
    });

    const resolved = await resolveAssetMarkdownCached(`![img](lacuna-asset://${hash})`);
    expect(resolved).toBe('![img](blob:cached)');
  });

  it('revokes every cached URL and clears the cache at teardown', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xyz');
    await db.assets.put({
      hash: 'h3',
      blob: new Blob(['x'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 4,
      height: 3,
      createdAt: 0,
    });

    await resolveAssetUrl('h3');
    expect(_cacheSizeForTests()).toBe(1);

    revokeAllCachedUrls();
    expect(_cacheSizeForTests()).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:xyz');
    revokeObjectURL.mockRestore();
  });
});
