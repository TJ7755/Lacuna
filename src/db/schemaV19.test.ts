import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

// Arc 6 §6.3/§6.9 Task 6: schema v19 adds image occlusion. New table `occlusions`
// (following the sequences precedent), plus an `occlusionRegionId` index on `cards`.
// Additive only — no `.upgrade()` data pass — so a pre-migration snapshot of a v18
// database should open unchanged at v19, and the new table should exist, empty.
describe('schema v19: image occlusion (additive)', () => {
  beforeEach(async () => {
    await db.delete();
  });

  it('opens a v18 database unchanged, with existing cards and sequences intact', async () => {
    const legacy = new Dexie('lacuna');
    legacy.version(18).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
      courses: 'id, createdAt',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
      lessonCompletions: 'lessonId, completedAt',
      noteAnnotations: 'id, noteId, createdAt, updatedAt',
      practiceNodes: 'id, courseId, position, createdAt',
      practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      sequences: 'id, courseId, primaryLessonId, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
      lineageIdMappings: 'id, courseId',
      pendingMergeReviews: 'id, courseId',
    });
    await legacy.open();
    await legacy.table('courses').add({
      id: 'course-1',
      name: 'Course',
      createdAt: 1,
    });
    await legacy.table('decks').add({
      id: 'deck-1',
      name: 'Course bank',
      examDate: 1000,
      createdAt: 1,
      backingCourseId: 'course-1',
      backingLessonId: null,
    });
    await legacy.table('cards').add({
      id: 'pre-migration-card',
      deckId: 'deck-1',
      courseId: 'course-1',
      schedulingUnitId: 'course-1',
      type: 'front_back',
      front: 'Q',
      back: 'A',
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
      createdAt: 100,
    });
    await legacy.table('sequences').add({
      id: 'pre-migration-sequence',
      courseId: 'course-1',
      schedulingUnitId: 'course-1',
      primaryLessonId: null,
      name: 'Periodic table',
      items: [{ id: 'i0', value: 'Hydrogen' }],
      cueWindow: 2,
      createdAt: 100,
    });
    legacy.close();

    await db.open();

    const migratedCard = await db.cards.get('pre-migration-card');
    expect(migratedCard).toMatchObject({ id: 'pre-migration-card', front: 'Q', back: 'A' });
    expect(migratedCard).not.toHaveProperty('occlusionRegionId');

    const migratedSequence = await db.sequences.get('pre-migration-sequence');
    expect(migratedSequence).toMatchObject({ id: 'pre-migration-sequence', name: 'Periodic table' });
  });

  it('exposes the new occlusions table, empty, after migrating from v18', async () => {
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

    expect(await db.occlusions.get('occlusion-1')).toMatchObject({ courseId: 'course-1', name: 'Plant cell' });
    expect(await db.occlusions.where('courseId').equals('course-1').count()).toBe(1);
  });

  it('queries cards by the new occlusionRegionId index', async () => {
    await db.open();

    await db.cards.add({
      id: 'occlusion-card',
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
