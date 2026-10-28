import { expect, it } from 'vitest';
import {
  buildSpecificationProgress,
  type SpecificationPointProgress,
  type SpecificationProgressFilter,
} from './specificationProgress';
import { makeCard, makeCourse, makeExamDate, makeLesson } from './path.testFixtures';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import type { Concept } from '../questions/types';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { buildCourseProgress } from './courseProgress';
import { MS_PER_DAY } from '../fsrs/params';

const now = 100 * MS_PER_DAY;
function concept(id: string, links: string[] = []): Concept {
  return {
    id,
    name: id,
    scope: 'course',
    scopeKey: 'course:course',
    courseId: 'course',
    provisional: false,
    specificationPointIds: links,
    createdAt: 0,
    updatedAt: 0,
  };
}
function fixture() {
  const spec = {
    ...paperSpecification,
    points: [
      { id: 'biology', ref: 'B', title: 'Biology', parentId: null, kind: 'content' as const },
      ...paperSpecification.points.map((point) => ({ ...point, parentId: 'biology' })),
    ],
  };
  return {
    course: makeCourse({
      id: 'course',
      schoolCoveredLessonIds: ['school'],
      specificationData: spec,
      specificationRef: paperSpecificationReference,
    }),
    lessons: [
      makeLesson({ id: 'school', courseId: 'course' }),
      makeLesson({ id: 'extension', courseId: 'course', isExtension: true }),
    ],
    cards: [
      makeCard({
        id: 'reviewed',
        deckId: 'course',
        courseId: 'course',
        conceptId: 'shared',
        primaryLessonId: 'school',
        lastReviewed: now - MS_PER_DAY,
        stability: 30,
        state: 2,
        reps: 1,
      }),
      makeCard({
        id: 'taught',
        deckId: 'course',
        courseId: 'course',
        conceptId: 'shared',
        primaryLessonId: 'school',
      }),
      makeCard({ id: 'new', deckId: 'course', courseId: 'course', conceptId: 'enzyme' }),
      makeCard({
        id: 'suspended',
        deckId: 'course',
        courseId: 'course',
        conceptId: 'enzyme',
        suspended: true,
      }),
      makeCard({
        id: 'extension',
        deckId: 'course',
        courseId: 'course',
        conceptId: 'enzyme',
        primaryLessonId: 'extension',
      }),
    ],
    concepts: [
      concept('shared', ['example-science:cells', 'example-science:enzymes']),
      concept('enzyme', ['example-science:enzymes']),
      concept('unmapped'),
      concept('unknown', ['example-science:absent']),
      concept('other', ['other:cells']),
    ],
    assessments: [
      makeExamDate({
        id: 'final',
        courseId: 'course',
        kind: 'final',
        examDate: now + 60 * MS_PER_DAY,
      }),
    ],
    links: [],
    exposures: [],
    now,
  };
}

function ready(
  input = fixture(),
  filter: SpecificationProgressFilter = paperSpecificationReference,
  practice: ConceptPracticeItem[] = [],
) {
  const result = buildSpecificationProgress(input, filter, practice);
  if (result.kind !== 'ready') throw new Error('Expected supplied metadata');
  return result;
}

function point(rows: SpecificationPointProgress[], ref: string): SpecificationPointProgress {
  for (const row of rows) {
    if (row.ref === ref) return row;
    const child = row.children.find((candidate) => candidate.ref === ref);
    if (child) return child;
  }
  throw new Error(`Missing point ${ref}`);
}

it('deduplicates overlapping parent content and keeps taught, reviewed and excluded cards distinct', () => {
  const input = fixture();
  const result = ready(input);
  expect([result.coveredPoints, result.totalPoints]).toEqual([2, 3]);
  const root = result.roots[0];
  expect(root.concepts.map((row) => row.id).sort()).toEqual(['enzyme', 'shared']);
  expect(root.contentCards).toBe(5);
  expect(root.countedCards).toBe(3);
  expect(root.excludedCards).toBe(2);
  expect(root.study).toEqual({ reviewed: 1, taughtNotReviewed: 1, notStarted: 1 });
  const forecast = buildCourseProgress(input).forecast;
  if (forecast.kind !== 'applicable') throw new Error('Expected forecast');
  expect(root.forecast).toBeCloseTo(forecast.value, 12);
  expect(point(result.roots, '3').concepts).toEqual([]);
  expect(point(result.roots, '3').forecast).toBeNull();
  expect(result.unmappedConcepts.map((row) => row.id)).toEqual(['unmapped']);
  expect(result.unresolvedLinks.map((row) => row.pointId)).toEqual([
    'example-science:absent',
    'other:cells',
  ]);
});

it('filters paper, tier and route without changing course choices or inventing coverage', () => {
  const input = fixture();
  const before = structuredClone(input);
  const firstPaper = ready(input, { ...paperSpecificationReference, paperId: 'paper-1' });
  expect(firstPaper.roots[0].children.map((row) => row.ref)).toEqual(['1', '3']);
  expect(firstPaper.roots[0].canPractise).toBe(false);
  const foundation = ready(input, { ...paperSpecificationReference, tier: 'foundation' });
  expect(foundation.totalPoints).toBe(2);
  const noRoute = ready(input, {
    ...paperSpecificationReference,
    routeIds: [],
    paperId: 'paper-2',
  });
  expect(noRoute.roots).toEqual([]);
  expect(input).toEqual(before);
});

it('intersects a selected paper and measures its exact date instead of the nearest other assessment', () => {
  const input = fixture();
  const assessment = makeExamDate({
    id: 'paper',
    courseId: 'course',
    examDate: now + 3 * MS_PER_DAY,
    coverageMode: 'specification',
    specificationPaperId: 'paper-1',
  });
  input.assessments.push(assessment);
  const selected = { ...input, assessmentId: 'paper' };
  const result = ready(selected);
  expect(result.roots[0].children.map((row) => row.ref)).toEqual(['1', '3']);
  const forecast = buildCourseProgress(selected).forecast;
  if (forecast.kind !== 'assessment') throw new Error('Expected assessment horizon');
  expect(point(result.roots, '1').forecast).toBeCloseTo(forecast.value, 12);
  const later = ready({
    ...selected,
    assessments: input.assessments.map((row) =>
      row.id === 'paper' ? { ...row, examDate: now + 30 * MS_PER_DAY } : row,
    ),
  });
  expect(point(later.roots, '1').forecast!).toBeLessThan(point(result.roots, '1').forecast!);
  const undated = ready({
    ...selected,
    assessments: input.assessments.map((row) =>
      row.id === 'paper' ? { ...row, examDate: undefined } : row,
    ),
  });
  expect(point(undated.roots, '1').forecast).toBeNull();
});

it('keeps independent diagnostic counts separate from recall and supports Question-only content', () => {
  const input = fixture();
  input.concepts.push(concept('practical', ['example-science:practical']));
  const practice: ConceptPracticeItem[] = [
    {
      conceptId: 'practical',
      name: 'Practical',
      availableCount: 2,
      unseenCount: 2,
      familiarCount: 0,
      due: true,
      schedule: {
        stability: null,
        difficulty: null,
        lastReviewed: null,
        reps: 0,
        lapses: 0,
        state: 0,
        due: null,
        scheduledDays: 0,
        learningSteps: 0,
      },
      diagnosticEvidence: [
        {
          categoryId: 'knowledge',
          demonstratedCount: 1,
          gapCount: 2,
          lastObservedAt: now,
          latestOutcome: 'gap',
        },
      ],
    },
  ];
  const result = ready(input, paperSpecificationReference, practice);
  expect(result.coveredPoints).toBe(3);
  const practical = point(result.roots, '3');
  expect(practical.hasContent).toBe(true);
  expect(practical.countedCards).toBe(0);
  expect(practical.forecast).toBeNull();
  expect(practical.evidence.rows).toMatchObject([
    { id: 'knowledge', demonstrated: 1, gaps: 2, topicsWithGap: 1 },
  ]);
  expect(result.roots[0].forecast).toEqual(ready(input).roots[0].forecast);
});

it('reports missing and unresolved metadata separately and does not offer out-of-selection practice', () => {
  const input = fixture();
  expect(
    buildSpecificationProgress({ ...input, course: makeCourse({ id: 'course' }) }, {}),
  ).toEqual({ kind: 'missing' });
  expect(
    buildSpecificationProgress(
      { ...input, course: { ...input.course, specificationData: undefined } },
      {},
    ),
  ).toEqual({ kind: 'unresolved' });
  input.course.specificationRef = { ...paperSpecificationReference, tier: 'foundation' };
  expect(point(ready(input).roots, '2').canPractise).toBe(false);
  input.course.archived = true;
  expect(ready(input).roots[0].canPractise).toBe(false);
});
