import 'fake-indexeddb/auto';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { importLineageFirstTime, mergeLineageUpdate } from '../../db/mergeImport';
import type { SharePayloadV6 } from '../../db/share';
import {
  completeQuestionSetAttempt,
  saveQuestionSetAttemptPosition,
  saveQuestionSetMarking,
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitPracticeQuestion,
} from '../../questions/questionSetAttemptRepository';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { ConceptPracticeSelection } from '../../questions/questionSetAttempts';
import { startExamSkillPractice } from '../../questions/examSkillPractice';
import { useQuestionSetPathData } from './useQuestionSetPathData';
import type { QuestionSetPathNode } from '../../course/path';
import { QuestionSetCourseRow } from './QuestionSetCourseRow';
import { ToastProvider } from '../ui/Toast';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(cleanup);

function setRecord(id: string, questionId: string, allocationId: string): QuestionSetRecord {
  return {
    id,
    courseId: 'teacher-course',
    title: `Paper ${id}`,
    lessonIds: ['lesson-questions'],
    assessmentIds: [],
    questions: [
      {
        id: questionId,
        prompt: 'Solve x² - 4 = 0.',
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: allocationId,
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
    contentRevisionId: `${id}-revision-1`,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

function payload(overrides: Partial<SharePayloadV6> = {}): SharePayloadV6 {
  return {
    v: 6,
    by: 'Ms Teacher',
    at: 1_000,
    course: { n: 'Mathematics', o: 0, c: 1_000, e: 2_000_000, um: 'open' },
    lessons: [{ i: 'lesson-questions', n: 'Quadratics', notes: [], cards: [] }],
    concepts: [{ id: 'concept-quadratic', n: 'Solve a quadratic equation' }],
    questions: [],
    questionSets: [setRecord('set-a', 'question-a', 'allocation-a')],
    questionSetPracticeNodes: [
      {
        id: 'activity-practice',
        courseId: 'teacher-course',
        type: 'question-set',
        name: 'Practice Qs',
        questionSetIds: ['set-a'],
        afterLessonId: 'lesson-questions',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ],
    li: 'lineage-questions',
    rv: 1,
    ...overrides,
  };
}

function pathNode(courseId: string, questionSetIds: string[]): QuestionSetPathNode {
  return {
    id: 'activity-practice',
    nodeType: 'practice-question-set',
    practiceNode: {
      id: 'activity-practice',
      courseId,
      type: 'question-set',
      name: 'Practice Qs',
      questionSetIds,
      afterLessonId: 'lesson-questions',
      createdAt: 1,
      updatedAt: 1,
    },
    questionSetIds,
    afterLessonId: 'lesson-questions',
    nodeKey: 'activity-practice',
  };
}

async function completeSet(setId: string, now = 2_000, selection?: ConceptPracticeSelection) {
  let attempt = await startQuestionSetAttempt(setId, 'practice', now++, selection);
  for (const question of attempt.receipt.questions) {
    attempt = await saveQuestionSetAttemptPosition(
      attempt.id,
      attempt.revisionId,
      question.id,
      null,
      now++,
    );
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      question.id,
      { kind: 'written', text: 'x = 2 or x = -2' },
      question.id,
      now++,
    );
    attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, question.id, now++);
  }
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: attempt.receipt.questions.flatMap((question) =>
        question.answer!.allocations.map((allocation) => ({
          allocationId: allocation.id,
          status: 'awarded' as const,
          marks: allocation.maxMarks,
        })),
      ),
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: attempt.activeNodeId,
      activeAllocationId: null,
    },
    now++,
  );
  return completeQuestionSetAttempt(attempt.id, attempt.revisionId, now);
}

it('keeps each member of an activity legible when a course update adds question sets', async () => {
  const first = payload();
  const { course } = await importLineageFirstTime(first);
  const completed = await completeSet('set-a');

  const { result, rerender } = renderHook(
    ({ ids }: { ids: string[] }) => useQuestionSetPathData(pathNode(course.id, ids)),
    { initialProps: { ids: ['set-a'] } },
  );
  await waitFor(() => expect(result.current?.[0].attempt).toEqual(completed));

  await mergeLineageUpdate(
    course.id,
    payload({
      at: 3_000,
      rv: 2,
      questionSets: [first.questionSets[0], setRecord('set-b', 'question-b', 'allocation-b')],
      questionSetPracticeNodes: [
        { ...first.questionSetPracticeNodes[0], questionSetIds: ['set-a', 'set-b'] },
      ],
    }),
  );
  rerender({ ids: ['set-a', 'set-b'] });

  await waitFor(() => expect(result.current).toHaveLength(2));
  const [kept, added] = result.current!;
  expect(kept.content?.id).toBe('set-a');
  expect(kept.attempt).toEqual(completed);
  expect(added.content?.id).toBe('set-b');
  expect(added.attempt).toBeNull();
});

it('shows new parts after a real update extends a completed set, including a repeated update', async () => {
  const first = payload();
  const { course } = await importLineageFirstTime(first);
  const completed = await completeSet('set-a');
  render(
    <MemoryRouter>
      <ToastProvider>
        <QuestionSetCourseRow
          node={pathNode(course.id, ['set-a'])}
          index={0}
          authoring={false}
          lessons={[]}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
  const row = await screen.findByRole('button', { name: 'Practice questions: Paper set-a' });
  await waitFor(() => expect(row).toHaveTextContent('1/1 answered'));
  expect(row).not.toHaveTextContent('new part');

  const extended = payload({
    at: 3_000,
    rv: 2,
    questionSets: [
      {
        ...first.questionSets[0],
        contentRevisionId: 'set-a-revision-2',
        questions: [
          ...first.questionSets[0].questions,
          ...setRecord('set-new', 'question-new', 'allocation-new').questions,
        ],
      },
    ],
  });
  await mergeLineageUpdate(course.id, extended);
  await waitFor(() => expect(row).toHaveTextContent('1/1 answered · 1 new part'));
  expect(row.querySelector('.origin-left')).toHaveStyle({ width: '50%' });

  await mergeLineageUpdate(course.id, { ...extended, rv: 3 });
  await waitFor(() => expect(row).toHaveTextContent('1/1 answered · 1 new part'));
  expect(await db.questionSetAttempts.get(completed.id)).toEqual(completed);
});

it.each(['Concept', 'exam-skill'] as const)(
  'keeps full-set completion after newer partial %s practice and detects only genuinely added parts',
  async (kind) => {
    const first = payload();
    const allocation = first.questionSets[0].questions[0].answer!.allocations[0];
    allocation.dimension = 'application';
    allocation.techniqueTags = {
      taxonomyId: 'science-techniques',
      taxonomyVersion: 1,
      techniqueIds: ['calculation-setup'],
      provenance: { source: 'author' },
    };
    first.questionSets[0].questions.push(
      ...setRecord('set-b', 'question-b', 'allocation-b').questions,
    );
    const { course } = await importLineageFirstTime(first);
    const completed = await completeSet('set-a');
    const partial =
      kind === 'Concept'
        ? await completeSet('set-a', 3_000, {
            conceptId: 'concept-quadratic',
            questionSetId: 'set-a',
            questionId: 'question-a',
            novelty: 'familiar',
            fingerprint: 'question-a-original',
          })
        : (
            await startExamSkillPractice(course.id, 'calculation-setup', {
              now: 3_000,
              allowFamiliar: true,
            })
          ).attempt;
    expect(partial.receipt.questions).toHaveLength(1);
    render(
      <MemoryRouter>
        <ToastProvider>
          <QuestionSetCourseRow
            node={pathNode(course.id, ['set-a'])}
            index={0}
            authoring={false}
            lessons={[]}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    const row = await screen.findByRole('button', { name: 'Practice questions: Paper set-a' });
    await waitFor(() => expect(row).toHaveTextContent('2/2 answered'));
    expect(row).not.toHaveTextContent('new part');
    expect(row.querySelector('.origin-left')).toHaveStyle({ width: '100%' });

    await mergeLineageUpdate(
      course.id,
      payload({
        at: 4_000,
        rv: 2,
        questionSets: [
          {
            ...first.questionSets[0],
            contentRevisionId: 'set-a-revision-2',
            questions: [
              ...first.questionSets[0].questions,
              ...setRecord('set-c', 'question-c', 'allocation-c').questions,
            ],
          },
        ],
      }),
    );
    await waitFor(() => expect(row).toHaveTextContent('2/2 answered · 1 new part'));
    expect(row.querySelector('.origin-left')).toHaveStyle({ width: '67%' });
    expect(await db.questionSetAttempts.get(completed.id)).toEqual(completed);
    expect(await db.questionSetAttempts.get(partial.id)).toEqual(partial);
  },
);
