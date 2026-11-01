import { afterEach, expect, it, vi } from 'vitest';
import type { Course } from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { makeCard, makeCourse, makeLesson } from './path.testFixtures';
import { questionStudyScope } from './questionStudyScope';

afterEach(() => vi.restoreAllMocks());

function concept(id: string, specificationPointIds?: string[]): Concept {
  return {
    id,
    scope: 'course',
    scopeKey: 'course:course',
    courseId: 'course',
    name: id,
    provisional: false,
    specificationPointIds,
    createdAt: 0,
    updatedAt: 0,
  };
}

function fixture(overrides: Partial<Course> = {}) {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  return {
    course: makeCourse({ id: 'course', ...overrides }),
    lessons: [
      makeLesson({ id: 'first', courseId: 'course', orderIndex: 0 }),
      makeLesson({ id: 'second', courseId: 'course', orderIndex: 1 }),
    ],
    cards: [
      makeCard({ id: 'first-card', deckId: 'course', primaryLessonId: 'first' }),
      makeCard({ id: 'second-card', deckId: 'course', primaryLessonId: 'second' }),
    ],
    links: [],
    exposures: [
      { lessonId: 'first', cardId: 'first-card', taughtAt: 100, updatedAt: 100 },
      { lessonId: 'second', cardId: 'second-card', taughtAt: 100, updatedAt: 100 },
    ],
    assessments: [],
    practiceNodes: [],
    concepts: [concept('concept-first-card'), concept('concept-second-card'), concept('no-card')],
  };
}

it.each([false, true])(
  'uses lesson access independently of publisher locking (locked: %s)',
  (locked) => {
    const input = fixture({
      distributedCopy: { lineageId: 'publisher', revision: 1, locked, autoAcceptUpdates: true },
      unlockMode: 'semi-linear',
    });
    expect(questionStudyScope(input)).toEqual(['concept-first-card']);
    expect(
      questionStudyScope({ ...input, course: { ...input.course, unlockMode: 'open' } }),
    ).toEqual(['concept-first-card', 'concept-second-card', 'no-card']);
    expect(questionStudyScope({ ...input, course: { ...input.course, archived: true } })).toEqual(
      [],
    );
  },
);

it('keeps declared prior knowledge through lesson reordering without inventing exposure', () => {
  const input = fixture({
    unlockMode: 'semi-linear',
    studyStartLessonId: 'second',
    schoolCoveredLessonIds: ['first'],
    distributedCopy: { lineageId: 'publisher', revision: 1, locked: true, autoAcceptUpdates: true },
    localLessonOrder: ['second', 'first'],
  });
  input.exposures = [];
  const before = structuredClone(input);
  expect(questionStudyScope(input)).toEqual(['concept-first-card']);
  expect(input).toEqual(before);
});

it('respects dated access and lesson introductions, including linked membership', () => {
  const input = fixture({
    unlockMode: 'linear',
    linearCadence: { anchorDate: 500, intervalDays: 1 },
  });
  input.exposures = [];
  expect(questionStudyScope(input)).toEqual([]);
  input.exposures = [{ lessonId: 'second', cardId: 'second-card', taughtAt: 100, updatedAt: 100 }];
  expect(questionStudyScope(input)).toEqual([]);
  expect(
    questionStudyScope({
      ...input,
      links: [
        { id: 'linked', lessonId: 'first', cardId: 'second-card', createdAt: 0, updatedAt: 0 },
      ],
    }),
  ).toEqual(['concept-second-card']);
  expect(questionStudyScope({ ...input, course: { ...input.course, learnFirst: false } })).toEqual([
    'concept-first-card',
  ]);
});

it('filters tier and route restrictions while allowing unclassified course Concepts', () => {
  const input = fixture({
    specificationData: {
      ...paperSpecification,
      routes: [...paperSpecification.routes, { id: 'spoken', name: 'Spoken assessment' }],
      points: [
        ...paperSpecification.points,
        {
          id: 'spoken',
          ref: '4',
          title: 'Spoken assessment',
          parentId: null,
          kind: 'content',
          appliesTo: { routes: ['spoken'] },
        },
      ],
    },
    specificationRef: { ...paperSpecificationReference, tier: 'foundation' },
  });
  input.concepts = [
    concept('foundation', ['example-science:cells']),
    concept('higher', ['example-science:enzymes']),
    concept('spoken', ['example-science:spoken']),
    concept('unclassified'),
  ];
  expect(questionStudyScope(input)).toEqual(['foundation', 'unclassified']);
  expect(
    questionStudyScope({
      ...input,
      course: {
        ...input.course,
        specificationRef: { ...paperSpecificationReference, routeIds: ['spoken'] },
      },
    }),
  ).toEqual(['foundation', 'higher', 'spoken', 'unclassified']);
});

it('keeps a Concept accessible when an open course gains a Card without lesson membership', () => {
  const input = fixture();
  expect(questionStudyScope(input)).toContain('no-card');
  input.cards.push({
    ...input.cards[0],
    id: 'loose',
    conceptId: 'no-card',
    primaryLessonId: null,
    lastReviewed: 500,
  });
  expect(questionStudyScope(input)).toContain('no-card');
  expect(
    questionStudyScope({
      ...input,
      exposures: [],
      links: [
        { id: 'loose-link', lessonId: 'second', cardId: 'loose', createdAt: 0, updatedAt: 0 },
      ],
    }),
  ).not.toContain('no-card');
});
