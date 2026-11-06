import { describe, expect, it } from 'vitest';
import type { Card, Course, CourseAssessment, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { makeExamDateContext } from '../fsrs/examDate';
import { buildStudyReadiness } from './studyReadiness';

const NOW = 100 * MS_PER_DAY;

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course',
    name: 'Course',
    description: '',
    createdAt: 0,
    updatedAt: 0,
    examDate: NOW + 30 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'semi-linear',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 2,
    ...overrides,
  };
}

function lesson(id: string, overrides: Partial<Lesson> = {}): Lesson {
  return {
    id,
    courseId: 'course',
    name: id,
    orderIndex: 0,
    createdAt: 0,
    updatedAt: 0,
    isExtension: false,
    ...overrides,
  };
}

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'deck',
    schedulingUnitId: 'deck',
    courseId: 'course',
    primaryLessonId: 'core',
    type: 'front_back',
    front: id,
    back: id,
    stability: 1000,
    difficulty: 5,
    lastReviewed: NOW - MS_PER_DAY,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW + 50 * MS_PER_DAY,
    scheduledDays: 50,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function readiness(
  cards: Card[],
  options: {
    course?: Course;
    lessons?: Lesson[];
    assessments?: CourseAssessment[];
    links?: LessonCardLink[];
  } = {},
) {
  const target = options.course ?? course();
  return buildStudyReadiness({
    course: target,
    cards,
    examDateContext: makeExamDateContext(
      target,
      options.lessons ?? [lesson('core')],
      options.assessments ?? [],
      options.links,
    ),
    now: NOW,
  });
}

describe('buildStudyReadiness', () => {
  it('counts future-due cards below their exam target without assuming another review', () => {
    expect(readiness([card('weak', { stability: 2 })])).toEqual({
      totalCount: 1,
      belowTargetCount: 1,
      unintroducedCount: 0,
      ready: false,
    });
  });

  it('includes unstudied earlier and unreleased core material regardless of the new-card cap', () => {
    const target = course({ studyStartLessonId: 'current', newCardsPerDay: 1 });
    const unseen = { state: 0 as const, stability: null, lastReviewed: null, due: null };
    expect(
      readiness([card('old', { ...unseen, primaryLessonId: 'old' }), card('later', unseen)], {
        course: target,
        lessons: [lesson('old'), lesson('current'), lesson('core')],
      }),
    ).toEqual({ totalCount: 2, belowTargetCount: 2, unintroducedCount: 2, ready: false });
  });

  it('is ready only when every included card meets its target from current memory', () => {
    expect(readiness([card('one'), card('two')])).toEqual({
      totalCount: 2,
      belowTargetCount: 0,
      unintroducedCount: 0,
      ready: true,
    });
  });

  it('keeps buried and suspended weak cards in the denominator', () => {
    expect(
      readiness([
        card('secure'),
        card('buried', { stability: 1, buriedUntil: NOW + MS_PER_DAY }),
        card('suspended', { stability: 1, suspended: true }),
      ]),
    ).toEqual({ totalCount: 3, belowTargetCount: 2, unintroducedCount: 0, ready: false });
  });

  it('does not interpret an empty course as ready', () => {
    expect(readiness([])).toEqual({
      totalCount: 0,
      belowTargetCount: 0,
      unintroducedCount: 0,
      ready: false,
    });
  });

  it('excludes optional extensions while retaining a shared card taught in a core lesson', () => {
    const links: LessonCardLink[] = [
      { id: 'link', lessonId: 'core', cardId: 'shared', createdAt: 0, updatedAt: 0 },
    ];
    expect(
      readiness(
        [
          card('core'),
          card('optional', { primaryLessonId: 'extension', stability: 1 }),
          card('shared', { primaryLessonId: 'extension' }),
        ],
        { lessons: [lesson('core'), lesson('extension', { isExtension: true })], links },
      ),
    ).toEqual({ totalCount: 2, belowTargetCount: 0, unintroducedCount: 0, ready: true });
  });

  it('includes an optional extension explicitly covered by an upcoming assessment', () => {
    const assessment: CourseAssessment = {
      id: 'paper',
      courseId: 'course',
      name: 'Paper',
      kind: 'checkpoint',
      examDate: NOW + 5 * MS_PER_DAY,
      afterLessonId: 'core',
      coverageMode: 'custom',
      lessonIds: ['extension'],
      excludedCardIds: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const options = {
      lessons: [lesson('core'), lesson('extension', { isExtension: true })],
      assessments: [assessment],
    };
    const cards = [card('optional', { primaryLessonId: 'extension', stability: 1 })];
    expect(readiness(cards, options)).toMatchObject({ totalCount: 1, belowTargetCount: 1 });
    expect(
      readiness(cards, {
        ...options,
        assessments: [{ ...assessment, excludedCardIds: ['optional'] }],
      }),
    ).toMatchObject({ totalCount: 0, ready: false });
    expect(
      readiness(cards, { ...options, assessments: [{ ...assessment, examDate: NOW }] }),
    ).toMatchObject({ totalCount: 0, ready: false });
  });

  it('uses the card horizon including lesson overrides and maintenance after the exam', () => {
    const cards = [card('short-lived', { stability: 10 })];
    expect(readiness(cards)).toMatchObject({ belowTargetCount: 1, ready: false });
    expect(
      readiness(cards, { lessons: [lesson('core', { examDate: NOW + 2 * MS_PER_DAY })] }),
    ).toMatchObject({ belowTargetCount: 0, ready: true });
    expect(readiness(cards, { course: course({ examDate: NOW - 1 }) })).toMatchObject({
      belowTargetCount: 0,
      ready: true,
    });
  });

  it('ignores cards owned by another course', () => {
    expect(
      readiness([card('ours'), card('theirs', { courseId: 'elsewhere', stability: 1 })]),
    ).toEqual({
      totalCount: 1,
      belowTargetCount: 0,
      unintroducedCount: 0,
      ready: true,
    });
  });
});
