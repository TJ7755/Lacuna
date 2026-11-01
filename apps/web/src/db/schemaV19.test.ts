import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

describe('image occlusion storage', () => {
  beforeEach(async () => {
    await db.delete();
  });

  it('creates an empty occlusions table on a fresh install', async () => {
    await db.open();
    expect(await db.occlusions.count()).toBe(0);
  });

  it('reads and writes occlusions rows', async () => {
    await db.open();

    await db.occlusions.add({
      id: 'occlusion-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'Plant cell',
      assetHash: 'hash-1',
      regions: [
        { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      ],
      createdAt: 500,
      updatedAt: 500,
    });

    expect(await db.occlusions.get('occlusion-1')).toMatchObject({
      courseId: 'course-1',
      name: 'Plant cell',
    });
    expect(await db.occlusions.where('courseId').equals('course-1').count()).toBe(1);
  });

  it('queries cards by the new occlusionRegionId index', async () => {
    await db.open();

    await db.cards.add({
      id: 'occlusion-card',
      conceptId: 'concept-occlusion-card',
      deckId: 'deck-1',
      courseId: 'course-1',
      schedulingUnitId: 'course-1',
      type: 'front_back',
      front: 'Label 1 of 1 — Nucleus',
      back: '',
      occlusionRegionId: 'region-1',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 500,
      updatedAt: 500,
    });

    const found = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('occlusion-card');
  });
});
