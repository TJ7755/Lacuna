import { expect, it } from 'vitest';
import type { CourseAssessment } from '@lacuna/core/db/types';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { computeCourseSummaries } from '../state/courseSummaries';
import {
  buildCourseProgress,
  OTHER_CARDS_ROW,
  scopeQuestions,
  selectableAssessments,
} from './courseProgress';
import { makeCard, makeCourse, makeExamDate, makeLesson } from './path.testFixtures';
import { buildStudyProgress } from './studyProgress';

const NOW = 100 * MS_PER_DAY;

function card(id: string, lessonId: string | null, reviewedDaysAgo?: number, stability = 10) {
  return makeCard({
    id,
    deckId: 'course',
    courseId: 'course',
    primaryLessonId: lessonId,
    ...(reviewedDaysAgo === undefined
      ? {}
      : {
          state: 2 as const,
          lastReviewed: NOW - reviewedDaysAgo * MS_PER_DAY,
          stability,
          due: NOW - reviewedDaysAgo * MS_PER_DAY + stability * MS_PER_DAY,
        }),
  });
}

function fixture() {
  const near = makeExamDate({
    id: 'near',
    courseId: 'course',
    name: 'Topic test',
    examDate: NOW + 3 * MS_PER_DAY,
    lessonIds: ['a'],
  });
  const final = makeExamDate({
    id: 'final',
    courseId: 'course',
    name: 'Final paper',
    kind: 'final',
    examDate: NOW + 60 * MS_PER_DAY,
  });
  return {
    course: makeCourse({
      id: 'course',
      examDate: final.examDate,
      schoolCoveredLessonIds: ['b'],
    }),
    lessons: [
      makeLesson({ id: 'a', courseId: 'course', name: 'Cells', orderIndex: 0 }),
      makeLesson({ id: 'b', courseId: 'course', name: 'Enzymes', orderIndex: 1 }),
      makeLesson({ id: 'empty', courseId: 'course', name: 'Empty', orderIndex: 2 }),
      makeLesson({
        id: 'ext',
        courseId: 'course',
        name: 'Further reading',
        orderIndex: 3,
        isExtension: true,
      }),
    ],
    cards: [
      card('a-reviewed', 'a', 2),
      card('a-due', 'a', 20, 5),
      card('a-exposed', 'a'),
      card('b-reviewed', 'b', 1, 30),
      card('b-school', 'b'),
      { ...card('b-suspended', 'b', 1), suspended: true },
      card('ext-reviewed', 'ext', 1),
    ],
    assessments: [final, near] as CourseAssessment[],
    links: [],
    exposures: [{ lessonId: 'a', cardId: 'a-exposed', taughtAt: NOW, updatedAt: NOW }],
    concepts: [],
    now: NOW,
  };
}

it('counts the same whole-course pool and per-paper forecast as the course summary', () => {
  const input = fixture();
  const report = buildCourseProgress(input);
  const summary = computeCourseSummaries(
    [input.course],
    input.lessons,
    input.cards,
    input.assessments,
    NOW,
    { links: input.links, exposures: input.exposures, completions: [] },
  )[input.course.id];

  expect(report.cardCount).toBe(5);
  expect(report.excluded).toEqual({ extension: 1, unavailable: 1 });
  expect(report.study).toEqual({ reviewed: 3, taughtNotReviewed: 2, notStarted: 0 });
  expect(report.dueCards).toBe(1);
  expect(report.forecast).toMatchObject({ kind: 'applicable', undatedCards: 0 });
  expect(report.forecast.kind === 'applicable' && report.forecast.value).toBeCloseTo(
    summary.mastery,
    12,
  );
  expect(report.lessons.map((lesson) => [lesson.lessonId, lesson.cardCount])).toEqual([
    ['a', 3],
    ['b', 2],
    ['empty', 0],
  ]);
  // An empty lesson has no figure rather than a perfect one.
  expect(report.lessons[2].value).toBeNull();
});

it('measures cards for an earlier paper at that paper rather than at the final date', () => {
  const input = fixture();
  const perPaper = buildCourseProgress(input).forecast;
  const finalOnly = buildCourseProgress({
    ...input,
    assessments: input.assessments.filter((assessment) => assessment.id === 'final'),
  }).forecast;
  expect(perPaper.kind).toBe('applicable');
  expect(finalOnly.kind).toBe('applicable');
  if (perPaper.kind !== 'applicable' || finalOnly.kind !== 'applicable') return;
  // Lesson a's cards are tested in three days, so they are predicted to be recalled better.
  expect(perPaper.value).toBeGreaterThan(finalOnly.value);
  // Only a single shared date can be drawn as one exam-day line.
  expect(perPaper.sharedDate).toBeUndefined();
  expect(finalOnly.sharedDate).toBe(input.course.examDate);

  // Mixed dates are reported one paper at a time; the rows add up to the headline.
  expect(perPaper.papers.map((paper) => [paper.date, paper.assessments, paper.cardCount])).toEqual([
    [NOW + 3 * MS_PER_DAY, [{ id: 'near', name: 'Topic test' }], 3],
    [input.course.examDate, [{ id: 'final', name: 'Final paper' }], 2],
  ]);
  const weighted =
    perPaper.papers.reduce((sum, paper) => sum + paper.value * paper.cardCount, 0) / 5;
  expect(weighted).toBeCloseTo(perPaper.value, 12);
});

it('scopes the pool, lessons and forecast to one selected assessment', () => {
  const input = fixture();
  const before = structuredClone(input);
  const report = buildCourseProgress({ ...input, assessmentId: 'near' });

  expect(report.assessment?.name).toBe('Topic test');
  expect(report.cardCount).toBe(3);
  expect(report.excluded).toEqual({ extension: 0, unavailable: 0 });
  expect(report.study).toEqual({ reviewed: 2, taughtNotReviewed: 1, notStarted: 0 });
  expect(report.lessons.map((lesson) => lesson.lessonId)).toEqual(['a']);
  expect(report.lessonIds).toEqual(['a']);
  expect(report.conceptIds.sort()).toEqual([
    'concept-a-due',
    'concept-a-exposed',
    'concept-a-reviewed',
  ]);
  expect(report.forecast).toMatchObject({ kind: 'assessment', daysRemaining: 3 });

  const handOff = buildStudyProgress({
    ...input,
    questionPractice: [],
    questionScopeConceptIds: [],
    dueReviewCardIds: new Set(),
    availableLessonIds: new Set(['a', 'b']),
    assessmentId: 'near',
  }).exam;
  expect(report.forecast.kind === 'assessment' && report.forecast.value).toBe(handOff?.value);
  expect(report.forecast.kind === 'assessment' && report.forecast.securedCards).toBe(
    handOff?.securedCards,
  );
  expect(input).toEqual(before);
});

it('states passed and undated assessments instead of forecasting them', () => {
  const input = fixture();
  const passed = makeExamDate({
    id: 'passed',
    courseId: 'course',
    examDate: NOW - MS_PER_DAY,
    lessonIds: ['a'],
  });
  const undated = makeExamDate({
    id: 'undated',
    courseId: 'course',
    examDate: undefined,
    lessonIds: ['a'],
  });
  const assessments = [...input.assessments, passed, undated];

  const past = buildCourseProgress({ ...input, assessments, assessmentId: 'passed' });
  expect(past.forecast).toEqual({ kind: 'past', date: passed.examDate });
  expect(past.lessons.every((lesson) => lesson.value === null)).toBe(true);
  expect(past.study.reviewed).toBe(2);

  expect(buildCourseProgress({ ...input, assessments, assessmentId: 'undated' }).forecast).toEqual({
    kind: 'undated',
  });
  expect(
    selectableAssessments(assessments, 'course', NOW).map((assessment) => assessment.id),
  ).toEqual(['near', 'final', 'undated', 'passed']);
});

it('reports an empty scope without a forecast', () => {
  const input = fixture();
  const report = buildCourseProgress({ ...input, cards: [] });
  expect(report.cardCount).toBe(0);
  expect(report.forecast).toEqual({ kind: 'empty' });
});

it('gives cards without a listed lesson their own row so the rows add up to the headline', () => {
  const input = fixture();
  const report = buildCourseProgress({
    ...input,
    cards: [...input.cards, card('loose', null, 3), card('loose-new', null)],
  });
  const other = report.lessons.at(-1);
  expect(other).toMatchObject({ lessonId: OTHER_CARDS_ROW, cardCount: 2, reviewedCards: 1 });
  expect(report.lessons.reduce((sum, lesson) => sum + lesson.cardCount, 0)).toBe(report.cardCount);
  if (report.forecast.kind !== 'applicable') throw new Error('expected a forecast');
  const weighted =
    report.lessons.reduce((sum, lesson) => sum + (lesson.value ?? 0) * lesson.cardCount, 0) /
    report.cardCount;
  expect(weighted).toBeCloseTo(report.forecast.value, 12);
});

it('keeps questions linked to a covered lesson when an assessment is selected', () => {
  const input = fixture();
  const questions = [
    { id: 'q-a', primaryLessonId: 'a', additionalLessonIds: [] },
    { id: 'q-b-linked-a', primaryLessonId: 'b', additionalLessonIds: ['a'] },
    { id: 'q-b', primaryLessonId: 'b', additionalLessonIds: [] },
    { id: 'q-none', primaryLessonId: null, additionalLessonIds: [] },
  ];
  const attempts = questions.map((question) => ({ questionId: question.id }));

  const whole = scopeQuestions(buildCourseProgress(input), questions, attempts);
  expect(whole.questions).toHaveLength(4);
  expect(whole.attempts).toHaveLength(4);

  const near = scopeQuestions(
    buildCourseProgress({ ...input, assessmentId: 'near' }),
    questions,
    attempts,
  );
  expect(near.questions.map((question) => question.id)).toEqual(['q-a', 'q-b-linked-a']);
  expect(near.attempts.map((attempt) => attempt.questionId)).toEqual(['q-a', 'q-b-linked-a']);
});

it('forecasts overlapping later papers without changing the nearest-target headline', () => {
  const input = fixture();
  const report = buildCourseProgress(input);
  const selected = buildCourseProgress({ ...input, assessmentId: 'final' });
  expect(report.laterPapers).toHaveLength(1);
  expect(report.laterPapers[0]).toMatchObject({
    assessments: [{ id: 'final', name: 'Final paper' }],
    cardCount: selected.cardCount,
  });
  expect(selected.forecast.kind).toBe('assessment');
  if (selected.forecast.kind !== 'assessment') throw new Error('Expected assessment');
  expect(report.laterPapers[0].value).toBe(selected.forecast.value);
  expect(report.cardCount).toBe(5);
  expect(report.forecast.kind).toBe('applicable');
  if (report.forecast.kind !== 'applicable') throw new Error('Expected applicable forecast');
  expect(report.forecast.papers.reduce((sum, paper) => sum + paper.cardCount, 0)).toBe(5);
  expect(selected.laterPapers).toEqual([]);
});

it('expires an assessment at its exact deadline in both selected and later forecasts', () => {
  const input = fixture();
  const final = input.assessments.find(({ id }) => id === 'final')!;
  const now = final.examDate!;
  const report = buildCourseProgress({ ...input, now });
  expect(report.laterPapers).toEqual([]);
  expect(buildCourseProgress({ ...input, now, assessmentId: 'final' }).forecast).toEqual({
    kind: 'past',
    date: now,
  });
});
