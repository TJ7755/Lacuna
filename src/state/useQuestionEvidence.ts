import { useLiveQuery } from 'dexie-react-hooks';
import { buildQuestionEvidence, type QuestionEvidenceReport } from '../course/questionEvidence';

/**
 * Exam-question evidence for a Progress scope, from the per-Concept aggregates that choose
 * practice. That module loads on demand, as it does for the Study hand-off.
 */
export function useQuestionEvidence(
  courseId: string | undefined,
  conceptIds: readonly string[] | undefined,
): QuestionEvidenceReport | undefined {
  const conceptKey = conceptIds?.join('\n');
  return useLiveQuery(async () => {
    if (!courseId || conceptKey === undefined) return undefined;
    const scope = conceptKey ? conceptKey.split('\n') : [];
    const { listConceptPractice } = await import('../questions/conceptPractice');
    return buildQuestionEvidence(await listConceptPractice(courseId, Date.now(), scope), scope);
  }, [courseId, conceptKey]);
}
