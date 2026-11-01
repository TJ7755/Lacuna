import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSetPathNode } from '../../course/path';
import type { CourseAssessment } from '../../db/types';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { getQuestionSet } from '../../questions/questionSetRepository';
import { listQuestionSetAttempts } from '../../questions/questionSetAttemptRepository';

export interface QuestionSetPathEntry {
  id: string;
  content: QuestionSetRecord | undefined;
  attempt: QuestionSetAttemptRecord | null;
  exam: CourseAssessment | undefined;
}

/** Each set of this course's activity, in authored order, with this course's latest
 *  whole-set attempt and its linked exam. A published update can grow an activity's ordered set
 *  selection, so every member keeps its own progress instead of the activity dropping
 *  its completed work and its new sets together. */
export function useQuestionSetPathData(
  node: QuestionSetPathNode,
): QuestionSetPathEntry[] | undefined {
  const courseId = node.practiceNode.courseId;
  const setIds = node.questionSetIds;
  return useLiveQuery(
    () =>
      db.transaction(
        'r',
        [db.questionSets, db.questionSetAttempts, db.courseAssessments],
        async () =>
          Promise.all(
            setIds.map(async (setId): Promise<QuestionSetPathEntry> => {
              const content = await getQuestionSet(setId);
              const attempts = await listQuestionSetAttempts(setId);
              const exam = content?.assessmentIds[0]
                ? await db.courseAssessments.get(content.assessmentIds[0])
                : undefined;
              return {
                id: setId,
                content: content?.courseId === courseId ? content : undefined,
                // Selected-Question receipts cannot describe whole-set progress.
                attempt:
                  attempts.find(
                    (attempt) =>
                      attempt.courseId === courseId &&
                      !attempt.conceptPractice &&
                      attempt.practiceScope !== 'question',
                  ) ?? null,
                exam: exam?.courseId === courseId ? exam : undefined,
              };
            }),
          ),
      ),
    [setIds, courseId],
  );
}
