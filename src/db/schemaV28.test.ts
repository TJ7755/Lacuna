import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

describe('schema v28 authored Question Sets', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('adds an empty aggregate store without changing legacy Question rows', async () => {
    const legacyQuestion = {
      id: 'legacy-question',
      courseId: 'course-1',
      primaryLessonId: null,
      kind: 'fixed',
      due: null,
      authoringUpdatedAt: 123,
      marker: 'must survive byte-for-byte',
    };
    const legacyAttempt = {
      id: 'legacy-attempt',
      questionId: legacyQuestion.id,
      courseId: legacyQuestion.courseId,
      updatedAt: 456,
      marker: 'must remain legacy evidence',
    };
    const legacy = new Dexie('lacuna');
    legacy.version(27).stores({
      questions: 'id, courseId, primaryLessonId, kind, due, authoringUpdatedAt',
      questionAttempts: 'id, questionId, courseId, shownAt, status, sessionId, updatedAt',
    });
    await legacy.open();
    await legacy.table('questions').add(legacyQuestion);
    await legacy.table('questionAttempts').add(legacyAttempt);
    legacy.close();

    await db.open();

    expect(db.verno).toBe(28);
    expect(await db.questions.get(legacyQuestion.id)).toEqual(legacyQuestion);
    expect(await db.questionAttempts.get(legacyAttempt.id)).toEqual(legacyAttempt);
    expect(await db.questionSets.count()).toBe(0);
  });
});
