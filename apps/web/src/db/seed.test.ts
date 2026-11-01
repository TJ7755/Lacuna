import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revokeAllCachedUrls } from './assetCache';
import { assetUrl, referencedAssetHashes, sha256Blob } from './assets';
import { db } from './schema';
import { isFirstRun, settleFirstRun } from './seed';
import type { Card, Course } from './types';

/** A drawing exactly as seed.ts stores it, so the tests track any change to the bytes. */
function seedSvg(name: string): string {
  const source = readFileSync('src/db/seed.ts', 'utf8').replace(/\r\n/g, '\n');
  return new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`).exec(source)![1];
}

async function svgAsset(svg: string, width: number, height: number) {
  const hash = await sha256Blob(new Blob([svg], { type: 'image/svg+xml' }));
  return {
    hash,
    url: assetUrl(hash),
    record: {
      hash,
      blob: new TextEncoder().encode(svg),
      mimeType: 'image/svg+xml' as const,
      width,
      height,
      createdAt: 0,
    },
  };
}

/** An existing learner's Welcome course: one reviewed, illustrated card from an earlier release. */
async function existingWelcomeCourse(back: string): Promise<Card> {
  await db.courses.put({ id: 'welcome', name: 'Welcome to Lacuna' } as Course);
  const card: Card = {
    id: 'illustrated',
    conceptId: 'concept-illustrated',
    deckId: 'welcome',
    courseId: 'welcome',
    schedulingUnitId: 'lesson',
    type: 'front_back',
    front: 'What does the forgetting curve show?',
    back,
    stability: 4,
    difficulty: 5,
    lastReviewed: 1_000,
    reps: 3,
    lapses: 0,
    state: 2,
    due: 2_000,
    scheduledDays: 4,
    learningSteps: 0,
    history: [],
    createdAt: 500,
    updatedAt: 500,
  };
  await db.cards.put(card);
  return card;
}

describe('first run', () => {
  beforeEach(async () => {
    revokeAllCachedUrls();
    for (const table of db.tables) await table.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('leaves a fresh database empty and records that the first run happened', async () => {
    expect(await isFirstRun()).toBe(true);

    await settleFirstRun();

    for (const table of db.tables) expect(await table.count(), table.name).toBe(0);
    expect(await isFirstRun()).toBe(false);
  });

  it('keeps an existing Welcome course and its learner history', async () => {
    const curve = await svgAsset(seedSvg('FORGETTING_CURVE_SVG'), 320, 160);
    await db.assets.put(curve.record);
    const card = await existingWelcomeCourse(`![Forgetting curve](${curve.url})`);

    await settleFirstRun();

    expect(await db.courses.get('welcome')).toMatchObject({ name: 'Welcome to Lacuna' });
    expect(await db.cards.get(card.id)).toEqual(card);
    expect(await isFirstRun()).toBe(false);
  });

  it('replaces legacy theme-dependent artwork in an existing Welcome course', async () => {
    const legacy = await svgAsset(seedSvg('LEGACY_FORGETTING_CURVE_SVG'), 320, 160);
    await db.assets.put(legacy.record);
    const card = await existingWelcomeCourse(`![Forgetting curve](${legacy.url})`);

    await settleFirstRun();

    const repaired = await db.cards.get(card.id);
    expect(repaired?.back).not.toContain(legacy.url);
    expect(repaired?.reps).toBe(card.reps);
    const [repairedHash] = referencedAssetHashes(repaired!.back);
    const asset = await db.assets.get(repairedHash);
    expect(new TextDecoder().decode(asset!.blob as Uint8Array)).not.toContain('currentColor');
  });

  it('repairs missing and Blob-backed artwork in an existing Welcome course', async () => {
    const curve = await svgAsset(seedSvg('FORGETTING_CURVE_SVG'), 320, 160);
    const sample = await svgAsset(seedSvg('SAMPLE_IMAGE_SVG'), 200, 120);
    await existingWelcomeCourse(`![Forgetting curve](${curve.url})\n\n![Sample](${sample.url})`);
    await db.assets.put({ ...curve.record, blob: new Blob(['broken']) });

    await settleFirstRun();

    const repaired = await db.assets.bulkGet([curve.hash, sample.hash]);
    expect(repaired.every((asset) => asset?.blob instanceof Uint8Array)).toBe(true);
    expect(
      repaired.every((asset) =>
        new TextDecoder().decode(asset!.blob as Uint8Array).startsWith('<svg'),
      ),
    ).toBe(true);
  });
});
