import type {
  ShareLesson,
  SharePayloadV2,
  SharePayloadV3,
  SharePayloadV4,
  SharePayloadV5,
} from './share';

export function coursePayload(overrides: Partial<SharePayloadV2> = {}): SharePayloadV2 {
  return {
    v: 2,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [],
    li: 'lineage-1',
    rv: 1,
    ...overrides,
  };
}

export function lessonOne(overrides: Partial<ShareLesson> = {}): ShareLesson {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [{ oi: 'note-1', n: 'Intro', c: 'Cells are the basic unit of life.' }],
    cards: [{ id: 'card-1', k: 0 as const, f: 'What is a cell?', b: 'The basic unit of life.' }],
    ...overrides,
  };
}

export function questionPayloadV3(overrides: Partial<SharePayloadV3> = {}): SharePayloadV3 {
  return {
    v: 3,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Mathematics', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [
      {
        i: 'lesson-questions',
        n: 'Quadratics',
        notes: [],
        cards: [
          {
            id: 'card-quadratic-definition',
            k: 0,
            f: 'What is a quadratic equation?',
            b: 'A polynomial equation of degree two.',
            co: 'concept-quadratic',
          },
          {
            id: 'card-quadratic-example',
            k: 0,
            f: 'Give one quadratic equation.',
            b: 'For example, x² - 4 = 0.',
            co: 'concept-quadratic',
          },
        ],
      },
    ],
    concepts: [{ id: 'concept-quadratic', n: 'Solve a quadratic equation' }],
    questions: [
      {
        id: 'question-quadratic',
        k: 0,
        n: 'Apply the quadratic method',
        pl: 0,
        t: 'concept-quadratic',
        pr: [],
        f: 'What is the positive root of x² - 4 = 0?',
        p: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        e: 'Factorise to (x - 2)(x + 2) = 0. The positive root is x = 2.',
      },
    ],
    li: 'lineage-questions',
    rv: 1,
    ...overrides,
  };
}

export function questionPayloadV4(overrides: Partial<SharePayloadV4> = {}): SharePayloadV4 {
  const base = questionPayloadV3();
  return {
    ...base,
    v: 4,
    questionSets: [
      {
        id: 'set-quadratics',
        courseId: 'teacher-course',
        title: 'Quadratics paper',
        lessonIds: ['lesson-questions'],
        assessmentIds: [],
        questions: [
          {
            id: 'set-question-quadratics',
            prompt: 'Solve x² - 4 = 0.',
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'allocation-quadratics',
                  criterion: 'Finds both roots',
                  maxMarks: 1,
                  dimension: 'knowledge',
                  targetConceptIds: ['concept-quadratic'],
                },
              ],
            },
            parts: [],
          },
        ],
        contentVersion: 1,
        contentRevisionId: 'set-revision-1',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ],
    ...overrides,
  };
}

export function questionPayloadV5(overrides: Partial<SharePayloadV5> = {}): SharePayloadV5 {
  return {
    ...questionPayloadV4(),
    v: 5,
    questionSetPracticeNodes: [
      {
        id: 'activity-quadratics',
        courseId: 'teacher-course',
        type: 'question-set',
        name: 'Practice Qs',
        questionSetIds: ['set-quadratics'],
        afterLessonId: 'lesson-questions',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ],
    ...overrides,
  };
}
