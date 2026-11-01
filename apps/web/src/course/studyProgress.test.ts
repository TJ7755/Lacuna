import { expect, it } from 'vitest';
import type { CourseAssessment } from '@lacuna/core/db/types';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { emptyQuestionSchedule } from '../questions/scheduler';
import type { Concept } from '@lacuna/core/questions/types';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { makeCard, makeCourse, makeExamDate, makeLesson } from './path.testFixtures';
import { buildStudyProgress } from './studyProgress';

const NOW = 100 * MS_PER_DAY;

function concept(id: string, name = id): Extract<Concept, { scope: 'course' }> {
  return {
    id,
    name,
    scope: 'course',
    scopeKey: 'course:course',
    courseId: 'course',
    provisional: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function card(id: string, lessonId: string | null = 'a') {
  return makeCard({
    id,
    conceptId: id,
    deckId: 'course',
    courseId: 'course',
    primaryLessonId: lessonId,
  });
}

function fixture() {
  return {
    course: makeCourse({ id: 'course', examDate: undefined }),
    lessons: [
      makeLesson({ id: 'a', courseId: 'course', orderIndex: 0 }),
      makeLesson({ id: 'b', courseId: 'course', orderIndex: 1 }),
    ],
    cards: [] as ReturnType<typeof card>[],
    assessments: [] as CourseAssessment[],
    links: [],
    concepts: [] as Concept[],
    questionPractice: [] as ConceptPracticeItem[],
    questionScopeConceptIds: [] as string[],
    dueReviewCardIds: new Set<string>(),
    availableLessonIds: new Set(['a']),
    now: NOW,
  };
}

function questions(
  conceptId: string,
  overrides: Partial<ConceptPracticeItem> = {},
): ConceptPracticeItem {
  return {
    conceptId,
    name: conceptId,
    schedule: emptyQuestionSchedule(),
    due: true,
    unseenCount: 2,
    familiarCount: 1,
    availableCount: 3,
    ...overrides,
  };
}

it('uses one selected assessment horizon with exact custom coverage and exclusions', () => {
  const input = fixture();
  const nearer = makeExamDate({
    id: 'near',
    courseId: 'course',
    name: 'Near paper',
    examDate: NOW + 2 * MS_PER_DAY,
    lessonIds: ['b'],
  });
  const later = makeExamDate({
    id: 'later',
    courseId: 'course',
    name: 'Later test',
    examDate: NOW + 10 * MS_PER_DAY,
    lessonIds: ['a'],
    excludedCardIds: ['excluded'],
  });
  const source = {
    ...input,
    course: { ...input.course, examDate: later.examDate },
    lessons: [{ ...input.lessons[0], examDate: NOW + MS_PER_DAY }, input.lessons[1]],
    cards: [
      { ...card('secure'), state: 2 as const, lastReviewed: NOW, stability: 10 },
      card('excluded'),
      card('linked', 'b'),
      card('unrelated', 'b'),
    ],
    links: [{ id: 'link', lessonId: 'a', cardId: 'linked', createdAt: 0, updatedAt: 0 }],
    assessments: [later, nearer],
  };
  expect(buildStudyProgress(source).exam).toMatchObject({
    name: 'Near paper',
    date: nearer.examDate,
    totalCards: 2,
    value: 0,
  });
  const before = structuredClone(source);
  expect(buildStudyProgress({ ...source, assessmentId: later.id }).exam).toEqual({
    name: 'Later test',
    date: later.examDate,
    daysRemaining: 10,
    totalCards: 2,
    securedCards: 1,
    value: 0.45,
    label: 'Predicted recall',
  });
  expect(
    buildStudyProgress({
      ...source,
      assessmentId: later.id,
      course: { ...source.course, examObjective: 'securedTopics' },
    }).exam,
  ).toMatchObject({ value: 0.5, label: 'Cards at 90% predicted recall' });
  expect(source).toEqual(before);
});

it('keeps specification papers scoped to applicable Concepts instead of the whole course', () => {
  const input = fixture();
  const cells = { ...concept('cells'), specificationPointIds: ['example-science:cells'] };
  const enzymes = { ...concept('enzymes'), specificationPointIds: ['example-science:enzymes'] };
  const paper: CourseAssessment = {
    id: 'paper',
    courseId: 'course',
    name: 'First paper',
    kind: 'checkpoint',
    coverageMode: 'specification',
    specificationPaperId: 'paper-1',
    afterLessonId: null,
    examDate: NOW + 10 * MS_PER_DAY,
    excludedCardIds: [],
    createdAt: 0,
    updatedAt: 0,
  };
  expect(
    buildStudyProgress({
      ...input,
      course: {
        ...input.course,
        specificationData: paperSpecification,
        specificationRef: paperSpecificationReference,
      },
      cards: [{ ...card('cells'), state: 2, lastReviewed: NOW, stability: 10 }, card('enzymes')],
      concepts: [cells, enzymes],
      assessments: [paper],
    }).exam,
  ).toMatchObject({ totalCards: 1, securedCards: 1, value: 0.9 });
});

it('reports current FSRS state after the last exam, excluding unavailable and extension Cards', () => {
  const input = fixture();
  const past = makeExamDate({ id: 'past', courseId: 'course', kind: 'final', examDate: NOW - 1 });
  const result = buildStudyProgress({
    ...input,
    course: { ...input.course, examDate: NOW - 1 },
    assessments: [past],
    lessons: [
      ...input.lessons,
      makeLesson({ id: 'extension', courseId: 'course', isExtension: true }),
    ],
    cards: [
      card('new'),
      { ...card('learning'), state: 1, lastReviewed: NOW, stability: 1 },
      { ...card('relearning'), state: 3, lastReviewed: NOW, stability: 3 },
      { ...card('review'), state: 2, lastReviewed: NOW, stability: 8 },
      { ...card('suspended'), suspended: true },
      { ...card('buried'), buriedUntil: NOW + 1 },
      card('extension-card', 'extension'),
      { ...card('foreign'), courseId: 'another-course' },
    ],
    dueReviewCardIds: new Set(['review', 'suspended', 'buried', 'extension-card']),
  });
  expect(result.exam).toBeUndefined();
  expect(result.fsrs).toEqual({
    newCards: 1,
    learningCards: 2,
    reviewCards: 1,
    dueCards: 1,
    totalCards: 4,
    meanStability: 4,
    recallNow: 1,
  });
});

it('does not invent completed progress for an empty course or an empty upcoming scope', () => {
  const input = fixture();
  expect(buildStudyProgress(input)).toMatchObject({
    fsrs: { totalCards: 0, meanStability: null, recallNow: null },
    priorities: [],
  });
  expect(buildStudyProgress({ ...input, cards: [card('new')] }).fsrs.recallNow).toBeNull();
  expect(
    buildStudyProgress({
      ...input,
      course: { ...input.course, examDate: NOW + MS_PER_DAY },
    }).exam,
  ).toMatchObject({ name: 'Final exam', totalCards: 0, securedCards: 0, value: null });
  expect(
    buildStudyProgress({
      ...input,
      cards: [card('outside', 'b')],
      assessments: [
        makeExamDate({
          id: 'empty',
          courseId: 'course',
          lessonIds: ['a'],
          examDate: NOW + MS_PER_DAY,
        }),
      ],
    }).exam,
  ).toMatchObject({ name: 'Checkpoint', totalCards: 0, value: null });
});

it('ignores a completed target and chooses the next upcoming real assessment', () => {
  const input = fixture();
  const past = makeExamDate({ id: 'past', courseId: 'course', examDate: NOW - 1 });
  const next = makeExamDate({
    id: 'next',
    courseId: 'course',
    name: 'Next test',
    examDate: NOW + MS_PER_DAY,
  });
  expect(
    buildStudyProgress({ ...input, assessments: [past, next], assessmentId: past.id }).exam,
  ).toMatchObject({ name: 'Next test', date: next.examDate });
  const legacy = {
    ...input,
    course: { ...input.course, examDate: NOW + MS_PER_DAY / 2 },
    assessments: [next],
  };
  expect(buildStudyProgress(legacy).exam).toMatchObject({
    name: 'Final exam',
    date: NOW + MS_PER_DAY / 2,
  });
  expect(buildStudyProgress({ ...legacy, assessmentId: next.id }).exam).toMatchObject({
    name: 'Next test',
    date: next.examDate,
  });
  expect(
    buildStudyProgress({
      ...input,
      course: { ...input.course, examDate: NOW + 100 * MS_PER_DAY },
      assessments: [{ ...past, kind: 'final' }],
    }).exam,
  ).toBeUndefined();
});

it('keeps available topic priorities course-wide and separates authored skills from observations', () => {
  const input = fixture();
  const result = buildStudyProgress({
    ...input,
    cards: [
      card('new'),
      { ...card('due-loose', null), state: 2, lastReviewed: NOW - MS_PER_DAY, stability: 1 },
      card('new-locked', 'b'),
      { ...card('future-locked', 'b'), state: 2, lastReviewed: NOW, stability: 1 },
    ],
    concepts: [
      concept('new', 'New topic'),
      concept('due-loose', 'Due topic'),
      concept('new-locked'),
      concept('future-locked'),
      concept('gap', 'Gap topic'),
      concept('authored', 'Authored topic'),
      concept('outside'),
    ],
    assessments: [
      makeExamDate({
        id: 'test',
        courseId: 'course',
        lessonIds: ['a'],
        examDate: NOW + MS_PER_DAY,
      }),
    ],
    assessmentId: 'test',
    questionScopeConceptIds: ['gap', 'authored'],
    dueReviewCardIds: new Set(['due-loose', 'new-locked']),
    questionPractice: [
      questions('gap', {
        needs: { knowledge: true, application: false, techniques: ['causal-link'] },
        techniqueIds: ['causal-link', 'unit-conversion'],
        diagnosticEvidence: [
          {
            categoryId: 'causal-link',
            demonstratedCount: 2,
            gapCount: 1,
            lastObservedAt: NOW,
            latestOutcome: 'gap',
          },
          {
            categoryId: 'unit-conversion',
            demonstratedCount: 3,
            gapCount: 2,
            lastObservedAt: NOW,
            latestOutcome: 'demonstrated',
          },
        ],
      }),
      questions('authored', { techniqueIds: ['paired-comparison'] }),
      questions('outside', { needs: { knowledge: true, application: true, techniques: [] } }),
    ],
  });
  expect(result.exam?.totalCards).toBe(1);
  expect(result.priorities.map((row) => row.conceptId)).toEqual([
    'gap',
    'due-loose',
    'authored',
    'new',
  ]);
  expect(result.priorities[0]).toMatchObject({
    knowledgeGap: true,
    applicationGap: false,
    questionCount: 3,
    skills: [
      { id: 'causal-link', demonstratedCount: 2, gapCount: 1, latestOutcome: 'gap' },
      { id: 'unit-conversion', demonstratedCount: 3, gapCount: 2, latestOutcome: 'demonstrated' },
    ],
  });
  expect(result.priorities[1]).toMatchObject({ dueCards: 1, newCards: 0 });
  expect(result.priorities[2]).toMatchObject({
    knowledgeGap: false,
    applicationGap: false,
    skills: [
      { id: 'paired-comparison', demonstratedCount: 0, gapCount: 0, latestOutcome: undefined },
    ],
  });
});

it('lists current work rather than every reviewed topic or authored question pool', () => {
  const input = fixture();
  const result = buildStudyProgress({
    ...input,
    cards: [
      { ...card('reviewed'), state: 2, lastReviewed: NOW, stability: 10 },
      { ...card('due-loose', null), state: 2, lastReviewed: NOW - MS_PER_DAY, stability: 1 },
    ],
    concepts: [
      concept('reviewed'),
      concept('not-due'),
      concept('exhausted'),
      concept('gap'),
      concept('unfinished'),
      concept('due-loose'),
      concept('empty'),
    ],
    questionScopeConceptIds: ['not-due', 'exhausted', 'gap', 'unfinished', 'empty'],
    dueReviewCardIds: new Set(['due-loose']),
    questionPractice: [
      questions('not-due', { due: false, techniqueIds: ['causal-link'] }),
      questions('exhausted', { unseenCount: 0, familiarCount: 3, techniqueIds: ['causal-link'] }),
      questions('gap', {
        due: false,
        unseenCount: 0,
        familiarCount: 0,
        availableCount: 0,
        needs: { knowledge: false, application: false, techniques: ['causal-link'] },
        diagnosticEvidence: [
          {
            categoryId: 'causal-link',
            demonstratedCount: 0,
            gapCount: 1,
            lastObservedAt: NOW,
            latestOutcome: 'gap',
          },
        ],
      }),
      questions('unfinished', { due: false, unseenCount: 0, familiarCount: 3, unfinished: true }),
      questions('empty', { unseenCount: 0, familiarCount: 0, availableCount: 0 }),
    ],
  });
  expect(result.priorities.map((row) => row.conceptId)).toEqual(['gap', 'due-loose', 'unfinished']);
  expect(result.priorities[0]).toMatchObject({ questionCount: 0, skills: [{ gapCount: 1 }] });
  expect(result.priorities[1]).toMatchObject({ dueCards: 1, newCards: 0 });
  expect(result.priorities[2]).toMatchObject({ questionCount: 3 });
  expect(result.otherTopics?.map((row) => row.conceptId)).toEqual([
    'exhausted',
    'not-due',
    'reviewed',
  ]);
  expect(result.otherTopics?.[0]).toMatchObject({
    knowledgeGap: false,
    applicationGap: false,
    questionCount: 3,
    skills: [{ id: 'causal-link', demonstratedCount: 0, gapCount: 0, latestOutcome: undefined }],
  });
});

it.each([
  ['2026-10-27T12:00:00Z', '2026-10-27T14:00:00Z', 'Europe/London', 0],
  ['2026-10-27T23:00:00Z', '2026-10-28T01:00:00Z', 'America/Los_Angeles', 0],
  ['2026-10-27T23:00:00Z', '2026-10-28T01:00:00Z', 'UTC', 1],
] as const)('counts calendar days for %s to %s in %s', (now, date, timeZone, daysRemaining) => {
  const input = fixture();
  const exam = makeExamDate({
    id: 'timed-exam',
    courseId: 'course',
    examDate: Date.parse(date),
    timeZone,
    lessonIds: ['a'],
  });
  expect(
    buildStudyProgress({
      ...input,
      course: { ...input.course, timeZone: 'Asia/Tokyo' },
      assessments: [exam],
      now: Date.parse(now),
    }).exam,
  ).toMatchObject({ date: Date.parse(date), timeZone, daysRemaining });
});
