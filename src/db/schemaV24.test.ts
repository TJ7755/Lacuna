import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';

const v23Stores = {
  cards:
    'id, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed, sequenceItemId, occlusionRegionId',
  sessionHistory: '++id, &eventId, sessionId, deckId, courseId, schedulingUnitId, timestamp',
  userPerformance: 'deckId',
  backups: '++id, createdAt',
  appState: 'key',
  assets: 'hash, createdAt',
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
  reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp',
  schedulingUnits: 'id, kind, courseId, lessonId',
  coursePerformance: 'courseId',
  schedulingPerformance: 'schedulingUnitId, courseId, lessonId',
  tombstones: '[table+recordId], deletedAt',
};

async function createV23Database(options: { protectStructuredCard?: boolean } = {}): Promise<void> {
  const legacy = new Dexie('lacuna');
  legacy.version(23).stores(v23Stores);
  await legacy.open();
  await legacy.table('cards').bulkAdd([
    {
      id: 'ordinary-card',
      schedulingUnitId: 'lesson-1',
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
      type: 'front_back',
      front: 'Capital of France?',
      back: 'Paris',
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
      updatedAt: 100,
    },
    {
      id: 'numeric-card',
      schedulingUnitId: 'lesson-1',
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
      type: 'front_back',
      front: 'What is 6 × 7?',
      back: '',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '42' } },
      stability: 4,
      difficulty: 5,
      lastReviewed: 200,
      reps: 1,
      lapses: 0,
      state: 2,
      due: 300,
      scheduledDays: 4,
      learningSteps: 0,
      history: [],
      createdAt: 100,
      updatedAt: 200,
    },
  ]);
  await legacy.table('reviewHistory').add({
    id: 'review:event-1',
    eventId: 'event-1',
    sessionId: 'session-1',
    sessionKind: 'lesson',
    cardId: 'numeric-card',
    deckId: 'lesson-1',
    schedulingUnitId: 'lesson-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    timestamp: 200,
    grade: 3,
    correct: true,
    responseTimeSec: 4,
    distracted: false,
    marksEarned: 1,
    marksAvailable: 1,
    stabilityBefore: null,
    stabilityAfter: 4,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  });
  await legacy.table('lessonCardExposures').add({
    lessonId: 'lesson-1',
    cardId: 'numeric-card',
    taughtAt: 200,
    updatedAt: 200,
  });
  await legacy.table('lessonCards').add({
    id: 'secondary-link',
    lessonId: 'lesson-2',
    cardId: 'numeric-card',
    createdAt: 150,
    updatedAt: 150,
  });
  await legacy.table('sessionHistory').add({
    eventId: 'event-1',
    sessionId: 'session-1',
    courseId: 'course-1',
    schedulingUnitId: 'lesson-1',
    timestamp: 200,
  });
  await legacy.table('courseAssessments').add({
    id: 'assessment-1',
    courseId: 'course-1',
    name: 'Final',
    kind: 'final',
    examDate: 10_000,
    coverageMode: 'prefix',
    afterLessonId: 'lesson-2',
    excludedCardIds: ['ordinary-card', 'numeric-card'],
    createdAt: 100,
    updatedAt: 200,
  });
  await legacy.table('revisionPlans').add({
    id: 'plan-1',
    assessmentId: 'assessment-1',
    courseId: 'course-1',
    status: 'active',
    updatedAt: 200,
    scope: {
      excludedCardIds: ['numeric-card'],
      eligibleCardIds: ['ordinary-card', 'numeric-card'],
      unavailableCardIds: ['numeric-card'],
    },
    cardStates: [{ cardId: 'numeric-card' }, { cardId: 'ordinary-card' }],
  });
  await legacy.table('practiceMilestones').add({
    nodeKey: 'milestone-1',
    courseId: 'course-1',
    scopeVersion: 1,
    updatedAt: 200,
  });
  await legacy.table('coursePerformance').add({
    courseId: 'course-1',
    runningMeanResponseTime: 99,
    runningStdDevResponseTime: 99,
    m2: 99,
    totalCorrectReviews: 99,
    updatedAt: 200,
  });
  await legacy.table('schedulingPerformance').add({
    schedulingUnitId: 'lesson-1',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    runningMeanResponseTime: 99,
    runningStdDevResponseTime: 99,
    m2: 99,
    totalCorrectReviews: 99,
    updatedAt: 200,
  });
  if (options.protectStructuredCard) {
    await legacy.table('lineageIdMappings').add({
      id: 'lineage-1',
      courseId: 'course-1',
      lessonIds: ['lesson-1'],
      noteIds: [],
      cardIds: ['numeric-card'],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    });
  }
  legacy.close();
}

describe('schema v24 Card and Question separation', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  it('assigns Concepts and converts supported structured Cards exactly once', async () => {
    await createV23Database();
    await db.open();

    expect(db.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['concepts', 'questions', 'questionConcepts', 'questionAttempts']),
    );
    expect(await db.cards.get('ordinary-card')).toMatchObject({
      conceptId: expect.stringContaining('concept:migrated:'),
    });
    expect(await db.cards.get('numeric-card')).toBeUndefined();

    const question = await db.questions.toCollection().first();
    expect(question).toMatchObject({
      kind: 'fixed',
      prompt: 'What is 6 × 7?',
      explanation: 'Expected answer: 42.',
      explanationStatus: 'legacy-derived',
      stability: 4,
      due: 300,
      scheduleEpoch: {
        reason: 'legacy-card-migration',
        baseline: { kind: 'legacy-replayable', sourceCardId: 'numeric-card' },
      },
      additionalLessonIds: ['lesson-2'],
    });
    expect(await db.questionConcepts.get(question!.id)).toMatchObject({
      targetConceptIds: [expect.stringContaining('concept:migrated:')],
      prerequisiteConceptIds: [],
    });
    expect(await db.questionAttempts.toCollection().first()).toMatchObject({
      questionId: question!.id,
      receiptOrigin: 'legacy-reconstructed',
      scheduleEffect: { kind: 'replay', grade: 3 },
      renderedExplanation: 'Expected answer: 42.',
    });
    expect(await db.reviewHistory.get('review:event-1')).toBeUndefined();
    expect(await db.lessonCardExposures.get(['lesson-1', 'numeric-card'])).toBeUndefined();
    expect(await db.lessonCards.get('secondary-link')).toBeUndefined();
    expect(await db.sessionHistory.where('eventId').equals('event-1').count()).toBe(0);
    expect(await db.courseAssessments.get('assessment-1')).toMatchObject({
      excludedCardIds: ['ordinary-card'],
    });
    expect(await db.revisionPlans.get('plan-1')).toMatchObject({
      scope: {
        excludedCardIds: [],
        eligibleCardIds: ['ordinary-card'],
        unavailableCardIds: [],
      },
      cardStates: [{ cardId: 'ordinary-card' }],
    });
    expect(await db.practiceMilestones.get('milestone-1')).toBeUndefined();
    expect(await db.coursePerformance.get('course-1')).toMatchObject({
      runningMeanResponseTime: 0,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 0,
    });
    expect(await db.schedulingPerformance.get('lesson-1')).toMatchObject({
      runningMeanResponseTime: 0,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 0,
    });
    expect(await db.tombstones.get(['cards', 'numeric-card'])).toBeDefined();
    expect(await db.tombstones.get(['lessonCards', 'secondary-link'])).toBeDefined();
    expect(await db.tombstones.get(['lessonCardExposures', 'lesson-1:numeric-card'])).toBeDefined();

    db.close();
    await db.open();
    expect(await db.questions.count()).toBe(1);
    expect(await db.questionAttempts.count()).toBe(1);
  });

  it('does not translate a structured Card owned by unresolved lineage state', async () => {
    await createV23Database({ protectStructuredCard: true });
    await db.open();

    expect(await db.questions.count()).toBe(0);
    expect(await db.questionAttempts.count()).toBe(0);
    expect(await db.cards.get('numeric-card')).toMatchObject({
      payload: { kind: 'numeric' },
      conceptId: expect.stringContaining('concept:migrated:'),
      reps: 1,
    });
    expect(await db.reviewHistory.get('review:event-1')).toBeDefined();
    expect(await db.lessonCards.get('secondary-link')).toBeDefined();
    expect(await db.lessonCardExposures.get(['lesson-1', 'numeric-card'])).toBeDefined();
    expect(await db.tombstones.get(['cards', 'numeric-card'])).toBeUndefined();
  });
});
