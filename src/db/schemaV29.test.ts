import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

describe('schema v29 authored Question Set attempts', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('adds an empty attempt store without changing v28 authored or legacy Question rows', async () => {
    const legacyQuestion = {
      id: 'legacy-question',
      courseId: 'course-1',
      kind: 'fixed',
      marker: 'legacy evidence',
    };
    const authoredSet = {
      id: 'set-1',
      courseId: 'course-1',
      title: 'Paper',
      lessonIds: [],
      assessmentIds: [],
      questions: [],
      contentVersion: 1,
      contentRevisionId: 'revision-1',
      createdAt: 1,
      updatedAt: 1,
      marker: 'authored content survives byte-for-byte',
    };
    const legacy = new Dexie('lacuna');
    legacy.version(28).stores({
      questions: 'id, courseId, primaryLessonId, kind, due, authoringUpdatedAt',
      questionSets: 'id, courseId, *lessonIds, *assessmentIds, updatedAt',
    });
    await legacy.open();
    await legacy.table('questions').add(legacyQuestion);
    await legacy.table('questionSets').add(authoredSet);
    legacy.close();

    await db.open();

    expect(db.verno).toBe(29);
    expect(await db.questions.get(legacyQuestion.id)).toEqual(legacyQuestion);
    expect(await db.questionSets.get(authoredSet.id)).toEqual(authoredSet);
    expect(await db.questionSetAttempts.count()).toBe(0);
  });
});
