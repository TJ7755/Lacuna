import { describe, expect, it } from 'vitest';
import type {
  Card,
  CourseAssessment,
  CourseRecord,
  LegacyDeckRecord,
  Lesson,
  UserPerformance,
} from './types';
import { defaultFsrsParameters } from '../fsrs/params';
import { buildDomainStorageMigration } from './storageMigration';

const parameters = defaultFsrsParameters();

function course(id: string): CourseRecord {
  return {
    id,
    name: `Course ${id}`,
    description: '',
    createdAt: 1,
    updatedAt: 1,
    fsrsVersion: 6,
    fsrsParameters: parameters,
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
    examDatePromptDismissed: true,
    autoOptimise: false,
    dailyReviewGoal: 10,
    sessionTimeLimitMinutes: 20,
    colour: 'amber',
    lastInteractedAt: 9,
  };
}

function lesson(courseId: string, id: string): Lesson {
  return {
    id,
    courseId,
    name: `Lesson ${id}`,
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    isExtension: false,
  };
}

function deck(id: string, courseId: string, lessonId: string | null): LegacyDeckRecord {
  return {
    id,
    name: id,
    examDate: 100,
    createdAt: 1,
    fsrsVersion: 6,
    fsrsParameters: parameters,
    examObjective: 'expectedMarks',
    backingCourseId: courseId,
    backingLessonId: lessonId,
  };
}

function card(
  id: string,
  deckId: string,
  courseId: string | null,
  primaryLessonId: string | null,
): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId,
    schedulingUnitId: deckId,
    courseId,
    primaryLessonId,
    type: 'front_back',
    front: id,
    back: id,
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
    createdAt: 1,
    updatedAt: 1,
  };
}

function performance(deckId: string, totalCorrectReviews: number): UserPerformance {
  return {
    deckId,
    runningMeanResponseTime: 2,
    runningStdDevResponseTime: 1,
    m2: 3,
    totalCorrectReviews,
  };
}

const finalAssessment = (courseId: string): CourseAssessment => ({
  id: `assessment-${courseId}`,
  courseId,
  name: 'Final exam',
  kind: 'final',
  examDate: 200,
  afterLessonId: null,
  coverageMode: 'prefix',
  excludedCardIds: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('buildDomainStorageMigration', () => {
  it('creates course and lesson scheduling units and maps cards to their owning unit', () => {
    const result = buildDomainStorageMigration(
      [course('course-1')],
      [lesson('course-1', 'lesson-1')],
      [finalAssessment('course-1')],
      [deck('bank', 'course-1', null), deck('lesson-deck', 'course-1', 'lesson-1')],
      [
        card('bank-card', 'bank', 'course-1', null),
        card('lesson-card', 'lesson-deck', 'course-1', 'lesson-1'),
      ],
      [performance('bank', 4), performance('lesson-deck', 7), performance('course-1', 9)],
    );

    expect(result.schedulingUnits.map((unit) => unit.id)).toEqual(
      expect.arrayContaining(['course-1', 'lesson-1']),
    );
    expect(result.schedulingUnits.find((unit) => unit.id === 'lesson-1')).toMatchObject({
      kind: 'lesson',
      courseId: 'course-1',
      createdAt: 1,
      examDatePromptDismissed: true,
      examDate: 200,
      autoOptimise: false,
      dailyReviewGoal: 10,
      sessionTimeLimitMinutes: 20,
      colour: 'amber',
      lastInteractedAt: 9,
    });
    expect(result.schedulingUnitByCardId.get('bank-card')).toBe('course-1');
    expect(result.schedulingUnitByCardId.get('lesson-card')).toBe('lesson-1');
    expect(
      result.schedulingPerformance.find((row) => row.schedulingUnitId === 'lesson-1'),
    ).toMatchObject({ totalCorrectReviews: 7, lessonId: 'lesson-1' });
    expect(result.coursePerformance).toEqual([
      expect.objectContaining({ courseId: 'course-1', totalCorrectReviews: 9 }),
    ]);
  });

  it('preserves an unowned deck performance row when its cards identify one lesson scope', () => {
    const result = buildDomainStorageMigration(
      [course('course-1')],
      [lesson('course-1', 'lesson-1')],
      [finalAssessment('course-1')],
      [
        {
          ...deck('unowned', 'course-1', 'lesson-1'),
          backingCourseId: undefined,
          backingLessonId: undefined,
        },
      ],
      [card('lesson-card', 'unowned', 'course-1', 'lesson-1')],
      [performance('unowned', 11)],
    );

    expect(result.schedulingUnitByDeckId.get('unowned')).toBe('lesson-1');
    expect(
      result.schedulingPerformance.find((row) => row.schedulingUnitId === 'lesson-1'),
    ).toMatchObject({ totalCorrectReviews: 11 });
  });

  it('rejects a backing lesson owned by another course', () => {
    const result = buildDomainStorageMigration(
      [course('course-1'), course('course-2')],
      [lesson('course-2', 'lesson-2')],
      [],
      [deck('wrong-owner', 'course-1', 'lesson-2')],
      [],
      [],
    );

    expect(result.schedulingUnitByDeckId.get('wrong-owner')).toBe('course-1');
  });

  it('combines performance from duplicate decks mapped to one scheduling unit', () => {
    const result = buildDomainStorageMigration(
      [course('course-1')],
      [lesson('course-1', 'lesson-1')],
      [],
      [
        deck('lesson-deck-a', 'course-1', 'lesson-1'),
        deck('lesson-deck-b', 'course-1', 'lesson-1'),
      ],
      [],
      [
        performance('lesson-deck-a', 4),
        {
          ...performance('lesson-deck-b', 6),
          runningMeanResponseTime: 8,
          m2: 4,
        },
      ],
    );

    expect(
      result.schedulingPerformance.find((row) => row.schedulingUnitId === 'lesson-1'),
    ).toMatchObject({
      totalCorrectReviews: 10,
      runningMeanResponseTime: 5.6,
      m2: 93.4,
    });
  });

  it('keeps a legacy deck as a compatibility scheduling unit when it has no course owner', () => {
    const result = buildDomainStorageMigration(
      [],
      [],
      [],
      [
        {
          ...deck('legacy', 'unused', null),
          backingCourseId: undefined,
          backingLessonId: undefined,
        },
      ],
      [card('legacy-card', 'legacy', null, null)],
      [performance('legacy', 3)],
    );

    expect(result.schedulingUnits).toEqual([
      expect.objectContaining({ id: 'legacy', kind: 'legacy-deck' }),
    ]);
    expect(result.schedulingUnitByCardId.get('legacy-card')).toBe('legacy');
    expect(result.schedulingPerformance).toEqual([
      expect.objectContaining({ schedulingUnitId: 'legacy', totalCorrectReviews: 3 }),
    ]);
  });
});
