import 'fake-indexeddb/auto';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import familyExample from '../../../../../docs/question-bank/examples/numeric-family.json';
import { db } from '../../db/schema';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import {
  createQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import type { QuestionSetPracticeNode } from '../../db/types';
import { importQuestionBank } from '../../questions/bank';
import { createQuestionSet } from '../../questions/questionSetRepository';
import {
  completeQuestionSetAttempt,
  saveQuestionSetMarking,
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitPracticeQuestion,
} from '../../questions/questionSetAttemptRepository';
import { questionSetPathProgress } from '../../questions/questionSetPathProgress';
import { useQuestionSetPathData } from './useQuestionSetPathData';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(cleanup);

it('switches progress to the selected identity while retaining completed and resumable old receipts', async () => {
  const course = await createCourse('Physics');
  const lesson = await createLesson(course.id, 'Density');
  const [set] = await importQuestionBank(familyExample, course.id);
  const replacement = await createQuestionSet({ ...set, id: 'replacement' });
  let node = await createQuestionSetPracticeNode(course.id, set.id, lesson.id);
  let complete = await startQuestionSetAttempt(set.id, 'practice', 100);
  const question = complete.receipt.questions[0];
  complete = await saveQuestionSetResponseDraft(
    complete.id,
    complete.revisionId,
    question.id,
    { kind: 'calculation', text: '42' },
    question.id,
    101,
  );
  complete = await submitPracticeQuestion(complete.id, complete.revisionId, question.id, 102);
  complete = await saveQuestionSetMarking(
    complete.id,
    complete.revisionId,
    {
      decisions: question.answer!.allocations.map((allocation) => ({
        allocationId: allocation.id,
        status: 'awarded',
        marks: allocation.maxMarks,
      })),
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: question.id,
      activeAllocationId: null,
    },
    103,
  );
  complete = await completeQuestionSetAttempt(complete.id, complete.revisionId, 104);
  const { result, rerender } = renderHook(
    ({ activity }: { activity: QuestionSetPracticeNode }) =>
      useQuestionSetPathData({
        id: activity.id,
        nodeType: 'practice-question-set',
        practiceNode: activity,
        questionSetIds: activity.questionSetIds,
        afterLessonId: activity.afterLessonId,
        nodeKey: activity.id,
      }),
    { initialProps: { activity: node } },
  );
  await waitFor(() => expect(result.current?.[0].attempt).toEqual(complete));
  expect(questionSetPathProgress(result.current![0].attempt)).toEqual({
    totalParts: 1,
    answeredParts: 1,
    markedParts: 1,
  });
  const open = await startQuestionSetAttempt(set.id, 'practice', 200);
  node = await updateQuestionSetPracticeNode(node.id, lesson.id, replacement.id, node.updatedAt);
  rerender({ activity: node });
  await waitFor(() => expect(result.current?.[0].content?.id).toBe(replacement.id));
  expect(result.current?.[0].attempt).toBeNull();
  expect(questionSetPathProgress(result.current![0].attempt)).toBeNull();
  expect(await db.questionSetAttempts.get(complete.id)).toEqual(complete);
  expect(await db.questionSetAttempts.get(open.id)).toEqual(open);
  const resumed = await saveQuestionSetResponseDraft(
    open.id,
    open.revisionId,
    question.id,
    { kind: 'calculation', text: 'Still working on the old set' },
    question.id,
    201,
  );
  expect(resumed.receipt).toEqual(open.receipt);
  const next = await startQuestionSetAttempt(replacement.id, 'practice', 300);
  await waitFor(() => expect(result.current?.[0].attempt).toEqual(next));
  expect(questionSetPathProgress(result.current![0].attempt)?.answeredParts).toBe(0);
  node = await updateQuestionSetPracticeNode(node.id, lesson.id, set.id, node.updatedAt);
  rerender({ activity: node });
  await waitFor(() => expect(result.current?.[0].attempt).toEqual(resumed));
  node = await updateQuestionSetPracticeNode(node.id, lesson.id, replacement.id, node.updatedAt);
  rerender({ activity: node });
  await waitFor(() => expect(result.current?.[0].attempt).toEqual(next));
});
