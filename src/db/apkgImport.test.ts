import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from './types';
import { db } from './schema';
import { importApkgResult, type ApkgImportResult } from './apkgImport';
import { createDeck } from './repository';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'anki-card',
    deckId: '',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: 12,
    difficulty: 4.2,
    lastReviewed: 1_700_000_000_000,
    reps: 7,
    lapses: 2,
    state: 2,
    due: 1_700_086_400_000,
    scheduledDays: 12,
    learningSteps: 3,
    history: [
      {
        timestamp: 1_700_000_000_000,
        grade: 3,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: 8,
        stabilityAfter: 12,
        difficultyBefore: 4.5,
        difficultyAfter: 4.2,
        retrievabilityAtReview: 0.88,
      },
    ],
    createdAt: 1_699_000_000_000,
    tags: ['imported'],
    suspended: true,
    buriedUntil: null,
    ...overrides,
  };
}

function makeResult(overrides: Partial<ApkgImportResult> = {}): ApkgImportResult {
  return {
    deckName: 'Imported deck',
    cards: [makeCard()],
    media: new Map(),
    skippedNotes: 0,
    skippedCards: 0,
    ...overrides,
  };
}

async function resetDatabase() {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.assets.clear(),
    db.userPerformance.clear(),
  ]);
}

describe('importApkgResult', () => {
  beforeEach(resetDatabase);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns cards with the non-default scheduling state persisted to the database', async () => {
    const result = makeResult();

    const imported = await importApkgResult(result);
    const returned = imported.cards[0];
    const persisted = await db.cards.get(returned.id);

    expect(returned).toMatchObject({
      stability: 12,
      difficulty: 4.2,
      lastReviewed: 1_700_000_000_000,
      reps: 7,
      lapses: 2,
      state: 2,
      due: 1_700_086_400_000,
      scheduledDays: 12,
      learningSteps: 3,
      history: result.cards[0].history,
      createdAt: 1_699_000_000_000,
      suspended: true,
    });
    expect(persisted?.createdAt).toBe(1_699_000_000_000);
    expect(persisted).toEqual(returned);
  });

  it('reuses an existing target deck without creating another deck', async () => {
    const target = await createDeck('Existing deck');

    const imported = await importApkgResult(makeResult(), target.id);

    expect(imported.deck).toEqual(target);
    expect(imported.cards[0].deckId).toBe(target.id);
    expect(await db.decks.toArray()).toEqual([target]);
  });

  it('rejects when the target deck does not exist', async () => {
    await expect(importApkgResult(makeResult(), 'missing-deck')).rejects.toThrow(
      'Target deck not found.',
    );
    expect(await db.cards.count()).toBe(0);
  });

  it('stores a referenced image once, rewrites HTML and Markdown, and ignores non-image media', async () => {
    vi.stubGlobal('Image', undefined);
    const imageBytes = new TextEncoder().encode('image bytes');
    const audioBytes = new TextEncoder().encode('audio bytes');
    const result = makeResult({
      cards: [
        makeCard({
          front: '<img src="diagram.png">',
          back: 'See ![diagram](diagram.png) and [sound:voice.mp3]',
        }),
      ],
      media: new Map([
        ['diagram.png', imageBytes],
        ['voice.mp3', audioBytes],
      ]),
    });

    const imported = await importApkgResult(result);
    const card = imported.cards[0];
    const assets = await db.assets.toArray();

    expect(assets).toHaveLength(1);
    expect(assets[0].mimeType).toBe('image/png');
    expect(card.front).toBe(`![image](lacuna-asset://${assets[0].hash})`);
    expect(card.back).toBe(
      `See ![diagram](lacuna-asset://${assets[0].hash}) and [sound:voice.mp3]`,
    );
    expect(await db.cards.get(card.id)).toEqual(card);
  });
});
