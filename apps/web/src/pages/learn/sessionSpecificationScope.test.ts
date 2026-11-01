import { afterEach, expect, it, vi } from 'vitest';
import type { Concept } from '@lacuna/core/questions/types';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../specifications/paperFixture.testFixtures';
import { makeCard, makeCourse, makeExamDate, makeLesson } from '../../course/path.testFixtures';
import { resolveSpecificationStudyScope } from '../../course/specificationStudyScope';
import { resolveCourseSessionSelection } from './sessionPool';
import { prepareSpecificationSessionPool as prepareCourseSessionPool } from './specificationSessionPool';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const course = makeCourse({
    id: 'course',
    specificationRef: paperSpecificationReference,
    specificationData: {
      ...paperSpecification,
      points: [
        { id: 'topic', ref: 'A', title: 'Topic', parentId: null, kind: 'content' },
        ...paperSpecification.points.map((point) => ({ ...point, parentId: 'topic' })),
      ],
    },
  });
  const concepts: Concept[] = ['cells', 'enzymes', 'practical'].map((id) => ({
    id,
    name: id,
    scope: 'course',
    scopeKey: 'course:course',
    courseId: 'course',
    provisional: false,
    specificationPointIds: [`example-science:${id}`],
    createdAt: 0,
    updatedAt: 0,
  }));
  const cards = ['cells', 'enzymes'].map((id) =>
    makeCard({
      id,
      deckId: 'course',
      courseId: 'course',
      conceptId: id,
      primaryLessonId: 'lesson',
    }),
  );
  return {
    course,
    concepts,
    cards,
    lessons: [makeLesson({ id: 'lesson', courseId: 'course' })],
    assessments: [
      makeExamDate({
        id: 'paper',
        courseId: 'course',
        kind: 'final',
        coverageMode: 'specification',
        specificationPaperId: 'paper-1',
      }),
    ],
    links: [],
    pointId: 'example-science:topic',
  };
}

it('resolves qualified descendants and deduplicates shared Concept Cards within the selected paper', () => {
  const input = fixture();
  input.concepts[0].specificationPointIds!.push('example-science:practical');
  const before = structuredClone(input);
  expect(resolveSpecificationStudyScope({ ...input, assessmentId: 'paper' })).toEqual({
    title: 'A Topic',
    conceptIds: ['cells', 'practical'],
    cardIds: ['cells'],
  });
  expect(input).toEqual(before);
});

it('does not resolve missing, stale or out-of-selection requests to the course', () => {
  const input = fixture();
  for (const pointId of ['', 'cells', 'example-science:missing', 'other:cells'])
    expect(resolveSpecificationStudyScope({ ...input, pointId })).toBeNull();
  for (const assessmentId of ['', 'missing'])
    expect(resolveSpecificationStudyScope({ ...input, assessmentId })).toBeNull();
  expect(
    resolveSpecificationStudyScope({
      ...input,
      course: { ...input.course, specificationData: undefined },
    }),
  ).toBeNull();
  expect(
    resolveSpecificationStudyScope({
      ...input,
      pointId: 'example-science:enzymes',
      course: {
        ...input.course,
        specificationRef: { ...paperSpecificationReference, tier: 'foundation' },
      },
    }),
  ).toBeNull();
  expect(
    resolveSpecificationStudyScope({ ...input, course: { ...input.course, archived: true } }),
  ).toBeNull();
});

it('narrows the real recall pool without bypassing exposure, availability, extension or paper coverage', () => {
  const input = fixture();
  input.concepts[0].specificationPointIds!.push('example-science:enzymes');
  const original = input.cards[0];
  input.lessons.push(makeLesson({ id: 'extension', courseId: 'course', isExtension: true }));
  input.cards.push(
    { ...original, id: 'unseen' },
    { ...original, id: 'suspended', suspended: true },
    { ...original, id: 'extension', primaryLessonId: 'extension' },
  );
  const source = {
    allCards: input.cards,
    courseLessons: input.lessons,
    examDates: input.assessments,
    manualNodes: [],
    courseLinks: [],
    courseExposures: input.cards
      .filter((card) => card.id !== 'unseen')
      .map((card) => ({
        lessonId: card.primaryLessonId!,
        cardId: card.id,
        taughtAt: 0,
        updatedAt: 0,
      })),
    concepts: input.concepts,
  };
  const request = {
    standaloneSimple: false,
    requestScopeLessonIds: undefined,
    practiceNodeKeyParam: null,
    requestAssessmentId: 'paper',
    requestSpecificationPointId: 'example-science:topic',
    filterParams: [],
    examPractice: false,
    catchUpPractice: false,
  };
  const selection = resolveCourseSessionSelection(input.course, source, request);
  const before = structuredClone(source);
  expect(
    prepareCourseSessionPool(input.course, source, selection, request, null).cards.map(
      (card) => card.id,
    ),
  ).toEqual(['cells']);
  for (const requestSpecificationPointId of ['', 'example-science:enzymes', 'missing'])
    expect(
      prepareCourseSessionPool(
        input.course,
        source,
        selection,
        { ...request, requestSpecificationPointId },
        null,
      ).cards,
    ).toEqual([]);
  expect(
    prepareCourseSessionPool(
      input.course,
      source,
      { ...selection, selectedAssessment: undefined },
      { ...request, requestAssessmentId: 'deleted-paper' },
      null,
    ).cards,
  ).toEqual([]);
  expect(source).toEqual(before);
});
