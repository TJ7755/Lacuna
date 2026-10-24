import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import type { SharePayloadV6 } from './share';
import {
  completeQuestionSetAttempt,
  listQuestionSetAttempts,
  saveQuestionSetMarking,
  startQuestionSetAttempt,
  submitPracticeQuestion,
} from '../questions/questionSetAttemptRepository';
import { questionSetProgress } from '../questions/questionSetProgress';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetQuestion } from '../questions/questionSets';

function question(questionId: string, allocationId: string): QuestionSetQuestion {
  return {
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
  };
}

function setRecord(
  id: string,
  questions: QuestionSetQuestion[],
  contentRevisionId = `${id}-revision-1`,
): QuestionSetRecord {
  return {
    id,
    courseId: 'teacher-course',
    title: `Paper ${id}`,
    lessonIds: ['lesson-questions'],
    assessmentIds: [],
    questions,
    contentVersion: 1,
    contentRevisionId,
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
    questionSets: [setRecord('set-a', [question('question-a', 'allocation-a')])],
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

async function completeOne(
  setId: string,
  questionId: string,
  allocationId: string,
  at = 2_000,
) {
  let attempt = await startQuestionSetAttempt(setId, 'practice', at);
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, questionId, at + 100);
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: [{ allocationId, status: 'awarded', marks: 1 }],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: attempt.activeNodeId,
      activeAllocationId: null,
    },
    at + 200,
  );
  return completeQuestionSetAttempt(attempt.id, attempt.revisionId, at + 300);
}

describe('course updates keep completed exam-style question progress', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('carries completed attempts across an additive update and a repeated update', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const completed = await completeOne('set-a', 'question-a', 'allocation-a');
    expect(completed.status).toBe('complete');

    const additive = payload({
      at: 3_000,
      rv: 2,
      questionSets: [
        first.questionSets[0],
        setRecord('set-b', [question('question-b', 'allocation-b')]),
      ],
      questionSetPracticeNodes: [
        {
          ...first.questionSetPracticeNodes[0],
          questionSetIds: ['set-a', 'set-b'],
        },
      ],
    });
    await mergeLineageUpdate(course.id, additive);

    const after = await listQuestionSetAttempts('set-a');
    expect(after.map((attempt) => attempt.id)).toEqual([completed.id]);
    expect(questionSetProgress(after).latest).toBe(100);
    expect(await listQuestionSetAttempts('set-b')).toEqual([]);
    expect(questionSetProgress(await listQuestionSetAttempts('set-b')).latest).toBeUndefined();

    await mergeLineageUpdate(course.id, { ...additive, rv: 3 });
    const repeated = await listQuestionSetAttempts('set-a');
    expect(repeated.map((attempt) => attempt.id)).toEqual([completed.id]);
    expect(questionSetProgress(repeated).latest).toBe(100);
    expect(await listQuestionSetAttempts('set-b')).toEqual([]);
  });

  it('retains the original receipt when an update adds a question to the completed set', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const completed = await completeOne('set-a', 'question-a', 'allocation-a');

    await mergeLineageUpdate(
      course.id,
      payload({
        at: 3_000,
        rv: 2,
        questionSets: [
          setRecord(
            'set-a',
            [question('question-a', 'allocation-a'), question('question-c', 'allocation-c')],
            'set-a-revision-2',
          ),
        ],
      }),
    );

    const [retained] = await listQuestionSetAttempts('set-a');
    expect(retained.id).toBe(completed.id);
    expect(retained.receipt).toEqual(completed.receipt);
    expect(retained.receipt.questions.map((row) => row.id)).toEqual(['question-a']);
    expect(questionSetProgress(await listQuestionSetAttempts('set-a')).latest).toBe(100);

    const fresh = await startQuestionSetAttempt('set-a', 'practice', 4_000);
    expect(fresh.receipt.questions.map((row) => row.id)).toEqual(['question-a', 'question-c']);
    expect(fresh.shownQuestionIds).toEqual(['question-a']);
  });
});
