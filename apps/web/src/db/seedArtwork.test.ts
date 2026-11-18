import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAssetUrl, revokeAllCachedUrls } from './assetCache';
import { db } from './schema';
import { seedArtworkFor } from './seedArtwork';

import { FORGETTING_CURVE_SVG } from './seed.testFixtures';

const storedHashes = [
  '83dcc930c1010020af0ccd1d9050bad606639eee505205dd8a917dad2655fbd9',
  '6628f6d02b9b5cf6a4f3148aefd00cb660d0cc8c57a9a5d29673d51a4f0821d1',
  '7436ef10804411a2622688ffe3265842ddaec2047838e8f01c225b282ec89e14',
  '4b0e794581633d4e3e8a44898217059d41230e2696e5fd3130c9c6d56ce8968d',
];

describe('Welcome seed artwork', () => {
  beforeEach(async () => {
    revokeAllCachedUrls();
    for (const table of db.tables) await table.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows a themed drawing for every version of the stored seed drawings', async () => {
    for (const hash of storedHashes) {
      const svg = await seedArtworkFor(hash)!.text();
      // The dark stone panel followed neither theme.
      expect(svg).toContain('prefers-color-scheme: dark');
      expect(svg).not.toContain('#1c1917');
      expect(svg).toContain('.accent { stroke: hsl(90 52% 19%); }');
      expect(svg).toContain('.accent { stroke: hsl(73 100% 62%); }');
    }
    expect(seedArtworkFor('0'.repeat(64))).toBeUndefined();
  });

  it('displays the themed drawing while leaving the seeded records untouched', async () => {
    const stored = FORGETTING_CURVE_SVG;
    const hash = createHash('sha256').update(stored, 'utf8').digest('hex');
    await db.assets.put({
      hash,
      blob: new TextEncoder().encode(stored),
      mimeType: 'image/svg+xml',
      width: 320,
      height: 160,
      createdAt: 0,
    });
    const shown: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      shown.push(blob as Blob);
      return 'blob:shown';
    });

    expect(await resolveAssetUrl(hash)).toBe('blob:shown');
    expect(await shown[0].text()).toContain('prefers-color-scheme: dark');
    // An upgrade must not rewrite a user's records: the asset keeps its seeded bytes.
    expect(new TextDecoder().decode((await db.assets.get(hash))!.blob as Uint8Array)).toBe(stored);
  });
});
