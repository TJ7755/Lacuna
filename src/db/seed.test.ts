import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAssetMarkdownCached, revokeAllCachedUrls } from './assetCache';
import { assetUrl, referencedAssetHashes, sha256Blob } from './assets';
import { db } from './schema';
import { seedIfFirstRun } from './seed';

const LEGACY_FORGETTING_CURVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <line x1="30" y1="130" x2="300" y2="130" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="16" y="25" font-size="10" fill="currentColor" opacity="0.6">R</text>
  <text x="16" y="135" font-size="10" fill="currentColor" opacity="0.6">t</text>
  <path d="M 30 30 Q 120 45 200 85 T 300 125" fill="none" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <line x1="30" y1="45" x2="300" y2="45" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="305" y="40" font-size="9" fill="currentColor" opacity="0.6">0.90</text>
</svg>`;

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
    expect(
      assets.every(
        (asset) => !new TextDecoder().decode(asset.blob as Uint8Array).includes('currentColor'),
      ),
    ).toBe(true);

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

    const searchCard = cards.find(
      (card) => card.front === 'How can you find content across all your courses?',
    );
    expect(searchCard?.back).toContain('**Search content**');
    expect(searchCard?.back).toContain('**Quick search**');
    expect(searchCard?.back).toContain('**Ctrl/Cmd+K**');
    expect(searchCard?.back).not.toContain('command palette');
  });

  it('replaces legacy theme-dependent seed artwork in an existing Welcome course', async () => {
    await seedIfFirstRun();

    const illustratedCard = (await db.cards.toArray()).find((card) =>
      card.back.includes('![Forgetting curve]'),
    );
    expect(illustratedCard).toBeDefined();

    const [currentHash] = referencedAssetHashes(illustratedCard!.back);
    const legacyBlob = new Blob([LEGACY_FORGETTING_CURVE_SVG], { type: 'image/svg+xml' });
    const legacyHash = await sha256Blob(legacyBlob);
    const legacyUrl = assetUrl(legacyHash);
    const currentUrl = assetUrl(currentHash);

    await db.assets.put({
      hash: legacyHash,
      blob: new TextEncoder().encode(LEGACY_FORGETTING_CURVE_SVG),
      mimeType: 'image/svg+xml',
      width: 320,
      height: 160,
      createdAt: Date.now(),
    });
    if (currentHash !== legacyHash) await db.assets.delete(currentHash);
    await db.cards.put({
      ...illustratedCard!,
      back: illustratedCard!.back.replace(currentUrl, legacyUrl),
    });
    localStorage.removeItem('lacuna-seed-assets-v3');

    await seedIfFirstRun();

    const repairedCard = await db.cards.get(illustratedCard!.id);
    expect(repairedCard?.back).not.toContain(legacyUrl);
    const [repairedHash] = referencedAssetHashes(repairedCard!.back);
    const repairedAsset = await db.assets.get(repairedHash);
    expect(new TextDecoder().decode(repairedAsset!.blob as Uint8Array)).not.toContain(
      'currentColor',
    );
  });

  it('repairs missing and Blob-backed seeded assets in an existing Welcome course', async () => {
    await seedIfFirstRun();
    const assets = await db.assets.toArray();
    expect(assets).toHaveLength(2);

    await db.assets.put({ ...assets[0], blob: new Blob(['broken']) });
    await db.assets.delete(assets[1].hash);
    localStorage.removeItem('lacuna-seed-assets-v3');

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
