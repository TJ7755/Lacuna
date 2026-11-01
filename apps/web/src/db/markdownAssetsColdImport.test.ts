import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./markdownAssets', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return importOriginal();
});
vi.mock('./markdownAssetExtraction', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return importOriginal();
});
vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(async (blob: Blob) => ({ blob, width: 12, height: 8 })),
}));

import { extractMarkdownAssets, referencedAssetHashes } from './assets';
import { db } from './schema';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('retains the write transaction while embedded-image processing loads cold', async () => {
  const markdown = `![scan](data:image/png;base64,${btoa('original-image')})`;
  const migrated = await db.transaction('rw', db.assets, () =>
    extractMarkdownAssets(markdown, (asset) => db.assets.put(asset)),
  );
  const hashes = referencedAssetHashes(migrated);
  expect(hashes).toHaveLength(1);
  expect(await db.assets.get(hashes[0])).toMatchObject({
    kind: 'image',
    mimeType: 'image/png',
    width: 12,
    height: 8,
    blob: new TextEncoder().encode('original-image'),
  });
});
