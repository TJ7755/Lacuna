import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAssetUrl, revokeAllCachedUrls } from './assetCache';
import { db } from './schema';
import { seedArtworkFor } from './seedArtwork';

function seedSource(): string {
  return readFileSync('apps/web/src/db/seed.ts', 'utf8').replace(/\r\n/g, '\n');
}

/** Every SVG the seed has ever stored, read from seed.ts so a changed drawing cannot slip by. */
function storedSeedSvgHashes(): string[] {
  return [...seedSource().matchAll(/const \w+_SVG = `([\s\S]*?)`;/g)].map((match) =>
    createHash('sha256').update(match[1], 'utf8').digest('hex'),
  );
}

function storedSeedSvg(name: string): string {
  return new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`).exec(seedSource())![1];
}

describe('Welcome seed artwork', () => {
  beforeEach(async () => {
    revokeAllCachedUrls();
    for (const table of db.tables) await table.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows a themed drawing for every version of the stored seed drawings', async () => {
    const hashes = storedSeedSvgHashes();
    expect(hashes).toHaveLength(4);
    for (const hash of hashes) {
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
    const stored = storedSeedSvg('FORGETTING_CURVE_SVG');
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
