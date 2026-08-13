import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from './types';
import { db } from './schema';
import { importApkgResult, type ApkgImportResult } from './apkgImport';
import { MAX_AUDIO_BYTES } from './assets';
import { createCourse, createLesson } from './repository';
import { reviewHistoryEntryId } from './reviewHistory';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'anki-card',
    deckId: '',
    schedulingUnitId: '',
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
    updatedAt: 1_699_000_000_000,
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
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.assets.clear(),
    db.userPerformance.clear(),
    db.reviewHistory.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.courseAssessments.clear(),
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
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
    expect(await db.courses.get(imported.courseId)).toMatchObject({ name: 'Imported deck' });
    expect(returned).toMatchObject({
      courseId: imported.courseId,
      primaryLessonId: null,
      schedulingUnitId: imported.courseId,
    });
    expect(await db.reviewHistory.where('cardId').equals(returned.id).toArray()).toEqual([
      expect.objectContaining({
        id: reviewHistoryEntryId(returned.id, result.cards[0].history[0]),
        cardId: returned.id,
        deckId: returned.deckId,
        schedulingUnitId: returned.deckId,
        timestamp: 1_700_000_000_000,
      }),
    ]);
  });

  it('persists Course metadata when importing into a Course/Lesson target', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const imported = await importApkgResult(makeResult(), lesson.id);

    expect(imported.cards[0]).toMatchObject({
      courseId: course.id,
      primaryLessonId: lesson.id,
      schedulingUnitId: lesson.id,
    });
    expect(await db.cards.get(imported.cards[0].id)).toMatchObject({
      courseId: course.id,
      primaryLessonId: lesson.id,
      schedulingUnitId: lesson.id,
    });
  });

  it('reuses an existing target Course without creating another Course', async () => {
    const target = await createCourse('Existing course');

    const imported = await importApkgResult(makeResult(), target.id);

    expect(imported.courseId).toBe(target.id);
    expect(imported.cards[0]).toMatchObject({
      courseId: target.id,
      schedulingUnitId: target.id,
    });
    expect(await db.courses.count()).toBe(1);
  });

  it('rejects when the target scheduling unit does not exist', async () => {
    await expect(importApkgResult(makeResult(), 'missing-deck')).rejects.toThrow(
      'Target scheduling unit not found.',
    );
    expect(await db.cards.count()).toBe(0);
  });

  it('rolls back a newly created Course when card persistence fails', async () => {
    const bulkPut = vi.spyOn(db.reviewHistory, 'bulkPut').mockRejectedValueOnce(new Error('history write failed'));

    await expect(importApkgResult(makeResult())).rejects.toThrow('history write failed');
    expect(await db.courses.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    bulkPut.mockRestore();
  });

  it('does not create a Course or cards when imported audio is rejected', async () => {
    const result = makeResult({
      media: new Map([['oversized.mp3', new Uint8Array(MAX_AUDIO_BYTES + 1)]]),
    });

    await expect(importApkgResult(result)).rejects.toThrow(/25 MB/);
    expect(await db.courses.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('stores referenced images and audio and rewrites their Anki markers', async () => {
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

    expect(assets).toHaveLength(2);
    const image = assets.find((asset) => asset.kind === 'image');
    const audio = assets.find((asset) => asset.kind === 'audio');
    expect(image?.mimeType).toBe('image/png');
    expect(audio?.mimeType).toBe('audio/mpeg');
    expect(card.front).toBe(`![image](lacuna-asset://${image!.hash})`);
    expect(card.back).toBe(
      `See ![diagram](lacuna-asset://${image!.hash}) and ![audio](lacuna-asset://${audio!.hash})`,
    );
    expect(await db.cards.get(card.id)).toEqual(card);
  });
});
