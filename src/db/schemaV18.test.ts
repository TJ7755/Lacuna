import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './repository';

// Arc 7 §7.2/§7.9 Task 1: schema v18 adds `Course.distributedCopy`/`Course.distribution`
// as optional fields and two new tables (`lineageIdMappings`, `pendingMergeReviews`).
// Additive only — no `.upgrade()` data pass — so a pre-migration snapshot of a v17
// database should open unchanged at v18, and the new tables should exist, empty.
describe('schema v18: classroom distribution (additive)', () => {
  beforeEach(async () => {
    await db.delete();
  });

  it('opens a v17 course unchanged and with no distribution fields', async () => {
    const legacy = new Dexie('lacuna');
    legacy.version(17).stores({
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
    });
    await legacy.open();
    await legacy.table('courses').add({
      id: 'pre-migration-course',
      name: 'Biology',
      description: '',
      createdAt: 100,
      fsrsVersion: 6,
      examObjective: 'expectedMarks',
      unlockMode: 'open',
      autoPractice: true,
      practiceThresholdMinutesFar: 10,
      practiceThresholdMinutesNear: 20,
      practiceUrgentWindowDays: 7,
      practiceMaxGap: 5,
    });
    legacy.close();

    await db.open();

    const migrated = await db.courses.get('pre-migration-course');
    expect(migrated).toMatchObject({ id: 'pre-migration-course', name: 'Biology' });
    expect(migrated).not.toHaveProperty('distributedCopy');
    expect(migrated).not.toHaveProperty('distribution');
  });

  it('creates new courses with no distribution fields by default', async () => {
    await db.open();
    const course = await createCourse('Chemistry');
    expect(course.distributedCopy).toBeUndefined();
    expect(course.distribution).toBeUndefined();
  });

  it('exposes the new lineage tables, empty, after migrating from v17', async () => {
    await db.open();
    expect(await db.lineageIdMappings.count()).toBe(0);
    expect(await db.pendingMergeReviews.count()).toBe(0);
  });

  it('reads and writes lineageIdMappings and pendingMergeReviews rows', async () => {
    await db.open();
    const course = await createCourse('History');

    await db.lineageIdMappings.add({
      id: 'lineage-1',
      courseId: course.id,
      lessonIds: ['l1'],
      noteIds: [],
      cardIds: ['c1'],
      sequenceIds: [],
    });
    await db.pendingMergeReviews.add({
      id: 'review-1',
      courseId: course.id,
      lineageId: 'lineage-1',
      revision: 2,
      diff: {
        creates: { lessons: [], notes: [], cards: [] },
        updates: { lessons: [], notes: [], cards: [] },
        removals: { lessonIds: [], noteIds: [], cardIds: [] },
        conflicts: [],
      },
      createdAt: 500,
    });

    expect(await db.lineageIdMappings.get('lineage-1')).toMatchObject({ courseId: course.id });
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).count()).toBe(1);
  });
});
