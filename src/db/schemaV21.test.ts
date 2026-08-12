import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { defaultFsrsParameters } from '../fsrs/params';
import type { Card, CourseAssessment, CourseRecord, ReviewLog } from './types';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';

const parameters = defaultFsrsParameters();

function legacyCourse(): CourseRecord {
  return {
    id: 'course-1',
    name: 'Biology',
    description: '',
    createdAt: 1,
    fsrsVersion: 6,
    fsrsParameters: parameters,
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
  };
}

function legacyCard(history: ReviewLog[]): Card {
  return {
    id: 'card-1',
    deckId: 'lesson-deck',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history,
    createdAt: 1,
  };
}

const stores = {
  decks: 'id, createdAt, examDate, folderId',
  cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId, occlusionRegionId',
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
  occlusions: 'id, courseId, primaryLessonId, createdAt',
  reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, timestamp',
};

describe('schema v21 domain storage', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  it('backfills explicit units, split performance and provenance from v20', async () => {
    const legacy = new Dexie('lacuna');
    legacy.version(20).stores(stores);
    await legacy.open();
    await legacy.table('courses').add(legacyCourse());
    await legacy.table('lessons').add({
      id: 'lesson-1',
      courseId: 'course-1',
      name: 'Cells',
      orderIndex: 0,
      createdAt: 1,
      isExtension: false,
    });
    await legacy.table('courseAssessments').add({
      id: 'final-1',
      courseId: 'course-1',
      name: 'Final exam',
      kind: 'final',
      examDate: 200,
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: 1,
    } satisfies CourseAssessment);
    await legacy.table('decks').bulkAdd([
      {
        id: 'lesson-deck',
        name: 'Cells',
        examDate: 200,
        createdAt: 1,
        fsrsVersion: 6,
        fsrsParameters: parameters,
        examObjective: 'expectedMarks',
        backingCourseId: 'course-1',
        backingLessonId: 'lesson-1',
      },
      {
        id: 'bank-deck',
        name: 'Question bank',
        examDate: 200,
        createdAt: 1,
        fsrsVersion: 6,
        fsrsParameters: parameters,
        examObjective: 'expectedMarks',
        backingCourseId: 'course-1',
        backingLessonId: null,
      },
    ]);
    const review = {
      eventId: 'review-1',
      timestamp: 100,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    } satisfies ReviewLog;
    await legacy.table('cards').add(legacyCard([review]));
    await legacy.table('reviewHistory').add({
      ...review,
      id: reviewHistoryEntryIdForEvent('review-1'),
      cardId: 'card-1',
      deckId: 'lesson-deck',
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
    });
    await legacy.table('userPerformance').bulkAdd([
      {
        deckId: 'lesson-deck',
        runningMeanResponseTime: 4,
        runningStdDevResponseTime: 1,
        m2: 2,
        totalCorrectReviews: 6,
      },
      {
        deckId: 'course-1',
        runningMeanResponseTime: 3,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 8,
      },
    ]);
    await legacy.table('sessionHistory').add({
      eventId: 'review-1',
      sessionId: 'session-1',
      deckId: 'lesson-deck',
      courseId: 'course-1',
      timestamp: 100,
      averagePredictedRetrievability: 0.5,
    });
    legacy.close();

    await db.open();

    expect(await db.schedulingUnits.get('course-1')).toMatchObject({ kind: 'course' });
    expect(await db.schedulingUnits.get('lesson-1')).toMatchObject({
      kind: 'lesson',
      examDate: 200,
    });
    expect(await db.coursePerformance.get('course-1')).toMatchObject({ totalCorrectReviews: 8 });
    expect(await db.schedulingPerformance.get('lesson-1')).toMatchObject({
      totalCorrectReviews: 6,
      lessonId: 'lesson-1',
    });
    expect(await db.cards.get('card-1')).toMatchObject({ schedulingUnitId: 'lesson-1' });
    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent('review-1'))).toMatchObject({
      schedulingUnitId: 'lesson-1',
    });
    expect(await db.sessionHistory.where('eventId').equals('review-1').first()).toMatchObject({
      schedulingUnitId: 'lesson-1',
    });

    await db.close();
    await db.open();
    expect(await db.schedulingUnits.where('id').equals('lesson-1').count()).toBe(1);
    expect(await db.schedulingPerformance.where('schedulingUnitId').equals('lesson-1').count()).toBe(1);
  });
});
