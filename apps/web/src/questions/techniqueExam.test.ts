import { makeCourse, makeLesson } from '../course/path.testFixtures';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import type { Concept } from '@lacuna/core/questions/types';
import { expect, it } from 'vitest';
import type { CourseAssessment } from '@lacuna/core/db/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { techniqueExamDate } from './techniqueExam';

const set: QuestionSetRecord = {
  id: 'set',
  courseId: 'c',
  title: 'Questions',
  questions: [],
  lessonIds: [],
  assessmentIds: ['exam'],
  contentVersion: 1,
  contentRevisionId: 'v1',
  createdAt: 1,
  updatedAt: 1,
};
function assessment(
  id: string,
  examDate: number,
): Extract<CourseAssessment, { coverageMode: 'prefix' }> {
  return {
    id,
    courseId: 'c',
    name: id,
    kind: 'checkpoint',
    afterLessonId: null,
    coverageMode: 'prefix',
    examDate,
    excludedCardIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

it('chooses only the nearest applicable strictly future assessment regardless of order', () => {
  for (let now = 0; now < 100; now++) {
    const exams = [
      assessment('exam', now + 1),
      assessment('unrelated', now + 0.5),
      assessment('exam', now),
      assessment('exam', now + 5),
    ];
    expect(techniqueExamDate([set], exams, [], now)).toBe(now + 1);
    expect(techniqueExamDate([set], exams.reverse(), [], now)).toBe(now + 1);
    expect(techniqueExamDate([set], [assessment('exam', now)], [], now)).toBeUndefined();
  }
});

it('resolves authored custom and prefix lesson coverage without broadening unrelated questions', () => {
  const first = makeLesson({ id: 'first', courseId: 'c', orderIndex: 0 });
  const second = makeLesson({ id: 'second', courseId: 'c', orderIndex: 1 });
  const candidate = { ...set, assessmentIds: [], lessonIds: ['second'] };
  const prefix = { ...assessment('prefix', 10), afterLessonId: 'first' };
  const custom: CourseAssessment = {
    ...assessment('custom', 20),
    coverageMode: 'custom',
    lessonIds: ['second'],
  };
  expect(techniqueExamDate([candidate], [prefix, custom], [first, second], 0)).toBe(20);
  expect(techniqueExamDate([candidate], [prefix], [first, second], 0)).toBeUndefined();
  expect(techniqueExamDate([candidate], [prefix], [first, second], 0, ['second', 'first'])).toBe(
    10,
  );
});

it('resolves specification coverage from the candidate question only and rejects unresolved metadata', () => {
  const course = makeCourse({
    id: 'c',
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const concept: Concept = {
    id: 'cells',
    scope: 'course',
    scopeKey: 'course:c',
    courseId: 'c',
    name: 'Cells',
    provisional: false,
    specificationPointIds: ['example-science:cells'],
    createdAt: 0,
    updatedAt: 0,
  };
  const question = {
    id: 'q',
    prompt: 'Explain',
    parts: [],
    answer: {
      maxMarks: 1,
      prerequisiteConceptIds: [],
      response: { kind: 'written' as const },
      allocations: [
        {
          id: 'a',
          maxMarks: 1,
          criterion: 'Evidence',
          dimension: 'application' as const,
          targetConceptIds: ['cells'],
        },
      ],
    },
  };
  const candidate = { ...set, assessmentIds: [], questions: [question] };
  const paper: CourseAssessment = {
    ...assessment('paper', 20),
    coverageMode: 'specification',
    specificationPaperId: 'paper-1',
  };
  expect(techniqueExamDate([candidate], [paper], [], 0, undefined, [concept], course)).toBe(20);
  expect(
    techniqueExamDate(
      [{ ...candidate, questions: [] }],
      [paper],
      [],
      0,
      undefined,
      [concept],
      course,
    ),
  ).toBeUndefined();
  expect(techniqueExamDate([candidate], [paper], [], 0, undefined, [concept])).toBeUndefined();
});
