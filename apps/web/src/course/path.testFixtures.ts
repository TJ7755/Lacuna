import type { Card, Course, CourseAssessment, Lesson, PracticeNode } from '@lacuna/core/db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '@lacuna/core/fsrs/params';

export function makeCourse(overrides: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    name: 'Test course',
    description: '',
    createdAt: 0,
    updatedAt: 0,
    examDate: 7 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 12,
    practiceThresholdMinutesNear: 6,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 3,
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<Lesson> & Pick<Lesson, 'id' | 'courseId'>): Lesson {
  return {
    name: 'Test lesson',
    orderIndex: 0,
    createdAt: 0,
    updatedAt: 0,
    isExtension: false,
    ...overrides,
  };
}

export function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    conceptId: `concept-${overrides.id}`,
    type: 'front_back',
    front: '',
    back: '',
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
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
    schedulingUnitId: overrides.schedulingUnitId ?? overrides.deckId ?? 'unit',
  };
}

export function makePracticeNode(
  overrides: Partial<PracticeNode> & Pick<PracticeNode, 'id' | 'courseId' | 'type'>,
): PracticeNode {
  return {
    name: 'Practice',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function makeExamDate(
  overrides: Partial<CourseAssessment> & Pick<CourseAssessment, 'id' | 'courseId'>,
): CourseAssessment {
  const coverage = overrides.lessonIds
    ? { coverageMode: 'custom' as const, lessonIds: overrides.lessonIds }
    : { coverageMode: 'prefix' as const };
  return {
    name: 'Checkpoint',
    kind: 'checkpoint',
    examDate: 10 * MS_PER_DAY,
    ...coverage,
    afterLessonId: null,
    excludedCardIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as CourseAssessment;
}
