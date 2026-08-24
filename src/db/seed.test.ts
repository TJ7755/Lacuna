import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAssetMarkdownCached, revokeAllCachedUrls } from './assetCache';
import { referencedAssetHashes } from './assets';
import { db } from './schema';
import { seedIfFirstRun } from './seed';

async function resetDatabase() {
  revokeAllCachedUrls();
  for (const table of db.tables) await table.clear();
  localStorage.clear();
}

describe('Welcome course seed assets', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it('stores seeded SVGs as bytes and resolves them for rendering', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:seeded-svg');

    await seedIfFirstRun();

    const assets = await db.assets.toArray();
    expect(assets).toHaveLength(2);
    expect(assets.every((asset) => asset.blob instanceof Uint8Array)).toBe(true);

    const illustratedCard = (await db.cards.toArray()).find(
      (card) => referencedAssetHashes(card.back).length > 0,
    );
    expect(illustratedCard).toBeDefined();
    await expect(resolveAssetMarkdownCached(illustratedCard!.back)).resolves.toContain(
      'blob:seeded-svg',
    );

    const cards = await db.cards.toArray();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => typeof card.conceptId === 'string')).toBe(true);
    const concepts = await db.concepts.bulkGet(cards.map((card) => card.conceptId));
    expect(concepts).toHaveLength(cards.length);
    expect(concepts.filter(Boolean)).toHaveLength(cards.length);
    expect(
      concepts.every(
        (concept, index) =>
          concept?.scope === 'course' && concept.courseId === cards[index].courseId,
      ),
    ).toBe(true);
  });

  it('repairs missing and Blob-backed seeded assets in an existing Welcome course', async () => {
    await seedIfFirstRun();
    const assets = await db.assets.toArray();
    expect(assets).toHaveLength(2);

    await db.assets.put({ ...assets[0], blob: new Blob(['broken']) });
    await db.assets.delete(assets[1].hash);
    localStorage.removeItem('lacuna-seed-assets-v2');

    await seedIfFirstRun();

    const repaired = await db.assets.bulkGet(assets.map((asset) => asset.hash));
    expect(repaired.every((asset) => asset?.blob instanceof Uint8Array)).toBe(true);
    expect(
      repaired.every((asset) =>
        new TextDecoder().decode(asset!.blob as Uint8Array).startsWith('<svg'),
      ),
    ).toBe(true);
  });
});
