import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { PathNode, QuestionSetPathNode } from '../../course/path';
import { getQuestionSet } from '../../questions/questionSetRepository';
import { listQuestionSetAttempts } from '../../questions/questionSetAttemptRepository';

/** The set, this course's latest attempt and its linked exam for one path activity. */
export function useQuestionSetPathData(node: QuestionSetPathNode) {
  const courseId = node.practiceNode.courseId;
  return useLiveQuery(
    () =>
      db.transaction(
        'r',
        [db.questionSets, db.questionSetAttempts, db.courseAssessments],
        async () => {
          const content = await getQuestionSet(node.questionSetId);
          const attempts = await listQuestionSetAttempts(node.questionSetId);
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
    [node.questionSetId, courseId],
  );
}

/** Set titles for the Practice Qs stops on a path, keyed by question set id. */
export function useQuestionSetTitles(nodes: PathNode[]): Map<string, string> {
  const ids = nodes.flatMap((node) =>
    node.nodeType === 'practice-question-set' ? [node.questionSetId] : [],
  );
  const key = ids.join('\n');
  const rows = useLiveQuery(
    async () =>
      ids.length === 0
        ? []
        : (await db.questionSets.bulkGet(ids)).flatMap((set) =>
            set ? [[set.id, set.title] as const] : [],
          ),
    [key],
  );
  return new Map(rows ?? []);
}
