import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { recordReview } from '../db/reviewRepository';
import { db } from '../db/schema';
import { useCourseStudyFlow } from './useCourseStudyFlow';
import { createConcept } from '../questions/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { startConceptPractice } from '../questions/conceptPractice';
import {
  completeQuestionSetAttempt,
  recordQuestionSetAssistance,
  saveQuestionSetMarking,
  submitPracticeQuestion,
} from '../questions/questionSetAttemptRepository';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it.each([
  { learnFirst: true, reordered: false },
  { learnFirst: true, reordered: true },
  { learnFirst: false, reordered: true },
])(
  'starts an untouched course at its teaching position ($learnFirst, reordered: $reordered)',
  async ({ learnFirst, reordered }) => {
    const course = await createCourse('Biology', { learnFirst, autoPractice: false });
    const first = await createLesson(course.id, 'Life processes');
    const second = await createLesson(course.id, 'Cells');
    const current = reordered ? second : first;
    await createLessonCard(course.id, first.id, 'front_back', 'Living?', 'Respiration.');
    const card = await createLessonCard(
      course.id,
      current.id,
      'front_back',
      'Membrane?',
      'Transport.',
    );
    await createLessonCard(course.id, current.id, 'front_back', 'Nucleus?', 'Genetic material.');
    await db.courses.update(course.id, {
      distributedCopy: {
        lineageId: 'publisher',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
      localLessonOrder: reordered ? [second.id, first.id] : undefined,
      studyStartLessonId: current.id,
      schoolCoveredLessonIds: [],
    });
    const later = await createConcept(course.id, 'Design controlled diffusion investigations');
    await createQuestionSet({
      id: 'diffusion-set',
      courseId: course.id,
      title: 'Diffusion application',
      lessonIds: [],
      assessmentIds: [],
      questions: ['diffusion-question', 'diffusion-transfer'].map((id) => ({
        id,
        prompt: `Explain dye penetration into agar cubes: ${id}.`,
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: `${id}-criterion`,
              criterion: 'Links diffusion to penetration.',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [later.id],
            },
          ],
        },
      })),
    });
    const { result, rerender } = renderHook(
      ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => expect(result.current?.generation).toBe(0));
    expect(result.current?.snapshot.questionOptions).toEqual([
      expect.objectContaining({ conceptId: later.id }),
    ]);
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: { kind: 'lesson', lessonId: current.id },
    });

    // A partial introduction is history, not a requirement to finish or master the lesson.
    await act(async () => {
      await db.lessonCardExposures.put({
        lessonId: current.id,
        cardId: card.id,
        taughtAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    rerender({ refreshKey: 1 });
    await waitFor(() => expect(result.current?.generation).toBe(1));
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: { kind: 'practice', mode: 'assessment' },
    });

    await act(async () => {
      await db.lessonCardExposures.clear();
      await db.courses.update(course.id, { schoolCoveredLessonIds: [current.id] });
    });
    rerender({ refreshKey: 2 });
    await waitFor(() => expect(result.current?.generation).toBe(2));
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: { kind: 'practice', mode: 'assessment' },
    });

    await act(async () => {
      await db.courses.update(course.id, { schoolCoveredLessonIds: [] });
      await startConceptPractice(course.id, later.id);
    });
    rerender({ refreshKey: 3 });
    await waitFor(() => expect(result.current?.generation).toBe(3));
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: { kind: 'exam-questions', conceptId: later.id },
    });

    await act(async () => {
      let { attempt } = await startConceptPractice(course.id, later.id, { resume: true });
      const question = attempt.receipt.questions[0];
      attempt = await recordQuestionSetAssistance(attempt.id, attempt.revisionId, {
        nodeId: question.id,
        kind: 'related-knowledge',
        occurredAt: Date.now(),
      });
      attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, question.id);
      attempt = await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
        decisions: [
          { allocationId: question.answer!.allocations[0].id, status: 'awarded', marks: 1 },
        ],
        annotations: [],
        corrections: [],
        reflection: { reasons: [], note: '' },
        activeNodeId: question.id,
        activeAllocationId: null,
      });
      await completeQuestionSetAttempt(attempt.id, attempt.revisionId);
    });
    rerender({ refreshKey: 4 });
    await waitFor(() => expect(result.current?.generation).toBe(4));
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: learnFirst
        ? { kind: 'exam-questions', conceptId: later.id }
        : { kind: 'practice', mode: 'assessment' },
    });
  },
);

it('labels a stale read with its own generation until the refreshed read arrives', async () => {
  const course = await createCourse('Biology');
  const { result, rerender } = renderHook(
    ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey),
    { initialProps: { refreshKey: 0 } },
  );
  await waitFor(() => expect(result.current?.generation).toBe(0));

  rerender({ refreshKey: 1 });
  // The conductor treats generation === refreshKey as the post-step plan; the
  // previous read must not claim that before the live query re-runs (#402).
  expect(result.current?.generation).toBe(0);
  await waitFor(() => expect(result.current?.generation).toBe(1));
});

it('does not rebuild a committed step after reviews, and refreshes before continuation', async () => {
  const course = await createCourse('Biology');
  const { result, rerender } = renderHook(
    ({ refreshKey, enabled }) => useCourseStudyFlow(course.id, refreshKey, enabled),
    { initialProps: { refreshKey: 0, enabled: true } },
  );
  await waitFor(() => expect(result.current?.course.name).toBe('Biology'));
  const committed = result.current;
  rerender({ refreshKey: 0, enabled: false });
  await act(async () => {
    await db.courses.update(course.id, { name: 'Cells' });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(result.current).toBe(committed);

  rerender({ refreshKey: 1, enabled: true });
  expect(result.current?.generation).toBe(0);
  await waitFor(() => expect(result.current?.generation).toBe(1));
  expect(result.current?.course.name).toBe('Cells');
});

it('loads a URL-seeded step once even when planning starts paused', async () => {
  const course = await createCourse('Biology');
  const { result } = renderHook(() => useCourseStudyFlow(course.id, 0, false));
  await waitFor(() => expect(result.current?.course.name).toBe('Biology'));
  const committed = result.current;
  await act(async () => {
    await db.courses.update(course.id, { name: 'Cells' });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(result.current).toBe(committed);
});

it('does not reuse a paused snapshot from another course', async () => {
  const first = await createCourse('Biology');
  const second = await createCourse('Chemistry');
  const { result, rerender } = renderHook(({ id }) => useCourseStudyFlow(id, 0, false), {
    initialProps: { id: first.id },
  });
  await waitFor(() => expect(result.current?.course.id).toBe(first.id));
  rerender({ id: second.id });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current?.course.id).toBe(second.id));
});

it('retains completed lessons as inactive topic inventory without reopening their work', async () => {
  const course = await createCourse('Biology', { schedulingMode: 'steady', learnFirst: false });
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Membrane?',
    'Controls transport.',
  );
  await recordReview({
    card,
    deck: course,
    kind: 'course',
    eventId: 'inventory-review',
    sessionId: 'inventory-session',
    sessionKind: 'practice',
    grade: 4,
    correct: true,
    responseTimeSec: 3,
    distracted: false,
  });
  const { result } = renderHook(() => useCourseStudyFlow(course.id));
  await waitFor(() =>
    expect(result.current?.snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lesson.id, nodeType: 'lesson', status: 'completed' }),
      ]),
    ),
  );
  expect(result.current?.progress?.priorities).toEqual([]);
  expect(result.current?.progress?.otherTopics).toEqual([
    expect.objectContaining({ conceptId: card.conceptId, dueCards: 0, newCards: 0 }),
  ]);
});

it('serves a technique-only question without fabricating a Concept and stops the sitting after an assisted answer', async () => {
  const course = await createCourse('Techniques', {
    schedulingMode: 'steady',
    learnFirst: false,
    autoPractice: false,
  });
  await createQuestionSet({
    id: 'skills-only',
    courseId: course.id,
    title: 'Graph evidence',
    lessonIds: [],
    assessmentIds: [],
    questions: ['q1', 'q2'].map((id) => ({
      id,
      prompt: `Interpret ${id}`,
      parts: [],
      answer: {
        maxMarks: 1,
        response: { kind: 'written' },
        prerequisiteConceptIds: [],
        allocations: [
          {
            id: `${id}-a`,
            criterion: 'Uses the trend',
            maxMarks: 1,
            dimension: 'application',
            targetConceptIds: [],
            techniqueTags: {
              taxonomyId: 'science-techniques',
              taxonomyVersion: 1,
              techniqueIds: ['graph-interpretation'],
              provenance: { source: 'author' },
            },
          },
        ],
      },
    })),
  });
  const sittingStartedAt = Date.now() - 10;
  const { result, rerender } = renderHook(
    ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey, true, null, sittingStartedAt),
    { initialProps: { refreshKey: 0 } },
  );
  await waitFor(() =>
    expect(result.current?.decision).toMatchObject({
      kind: 'step',
      step: { kind: 'exam-questions', techniqueId: 'graph-interpretation' },
    }),
  );
  expect(result.current?.snapshot.questionOptions?.[0].conceptId).toBeUndefined();
  await act(async () => {
    const { startExamSkillPractice } = await import('../questions/examSkillPractice');
    let { attempt } = await startExamSkillPractice(course.id, 'graph-interpretation', {
      study: { sittingStartedAt, scopeConceptIds: [], scopeLessonIds: [] },
    });
    const question = attempt.receipt.questions[0];
    attempt = await recordQuestionSetAssistance(attempt.id, attempt.revisionId, {
      nodeId: question.id,
      kind: 'answer-revealed',
      occurredAt: Date.now(),
    });
    attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, question.id);
    attempt = await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
      decisions: [
        { allocationId: question.answer!.allocations[0].id, status: 'awarded', marks: 0 },
      ],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: question.id,
      activeAllocationId: null,
    });
    await completeQuestionSetAttempt(attempt.id, attempt.revisionId);
  });
  rerender({ refreshKey: 1 });
  await waitFor(() => expect(result.current?.generation).toBe(1));
  expect(result.current?.snapshot.questionOptions).toEqual([]);
  expect(['complete', 'empty']).toContain(result.current?.decision.kind);
  expect(await db.concepts.count()).toBe(0);
});

it('keeps an equally urgent Concept before its tagged technique but resumes unfinished technique work first', async () => {
  const course = await createCourse('Ordering', {
    schedulingMode: 'steady',
    learnFirst: false,
    autoPractice: false,
  });
  const concept = await createConcept(course.id, 'Membranes', { id: 'z-membranes' });
  await createQuestionSet({
    id: 'ordering-set',
    courseId: course.id,
    title: 'Evidence',
    lessonIds: [],
    assessmentIds: [],
    questions: ['q1', 'q2'].map((id) => ({
      id,
      prompt: id,
      parts: [],
      answer: {
        maxMarks: 1,
        response: { kind: 'written' },
        prerequisiteConceptIds: [],
        allocations: [
          {
            id: `${id}-a`,
            criterion: 'Explains',
            maxMarks: 1,
            dimension: 'application',
            targetConceptIds: [concept.id],
            techniqueTags: {
              taxonomyId: 'science-techniques',
              taxonomyVersion: 1,
              techniqueIds: ['causal-link'],
              provenance: { source: 'author' },
            },
          },
        ],
      },
    })),
  });
  const { result, rerender } = renderHook(
    ({ refreshKey }) => useCourseStudyFlow(course.id, refreshKey),
    { initialProps: { refreshKey: 0 } },
  );
  await waitFor(() => expect(result.current?.snapshot.questionOptions).toHaveLength(2));
  expect(result.current?.snapshot.questionOptions?.[0]).toMatchObject({ conceptId: concept.id });
  await act(async () => {
    const { startExamSkillPractice } = await import('../questions/examSkillPractice');
    await startExamSkillPractice(course.id, 'causal-link');
  });
  rerender({ refreshKey: 1 });
  await waitFor(() => expect(result.current?.generation).toBe(1));
  expect(result.current?.snapshot.questionOptions?.[0]).toMatchObject({
    techniqueId: 'causal-link',
    unfinished: true,
  });
  expect(result.current?.decision).toMatchObject({
    kind: 'step',
    step: {
      kind: 'exam-questions',
      techniqueId: 'causal-link',
      label: 'Resume: Link cause and effect',
    },
  });
});
