import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSetPathNode } from '../../course/path';
import { getQuestionSet } from '../../questions/questionSetRepository';
import { listQuestionSetAttempts } from '../../questions/questionSetAttemptRepository';

/** The set, this course's latest attempt and its linked exam for one path activity. */
export function useQuestionSetPathData(node: QuestionSetPathNode) {
  const courseId = node.practiceNode.courseId;
  const setId = node.questionSetIds.length === 1 ? node.questionSetIds[0] : undefined;
  return useLiveQuery(
    () =>
      db.transaction(
        'r',
        [db.questionSets, db.questionSetAttempts, db.courseAssessments],
        async () => {
          if (!setId) return { content: undefined, attempt: null, exam: undefined };
          const content = await getQuestionSet(setId);
          const attempts = await listQuestionSetAttempts(setId);
          const exam = content?.assessmentIds[0]
            ? await db.courseAssessments.get(content.assessmentIds[0])
            : undefined;
          return {
            content: content?.courseId === courseId ? content : undefined,
            attempt: attempts.find((attempt) => attempt.courseId === courseId) ?? null,
            exam: exam?.courseId === courseId ? exam : undefined,
          };
        },
      ),
    [setId, courseId],
  );
}
