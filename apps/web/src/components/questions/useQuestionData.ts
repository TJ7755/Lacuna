import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../../questions/types';

export interface CourseQuestionData {
  questions: QuestionDefinition[];
  conceptSets: QuestionConceptSet[];
  concepts: Concept[];
  attempts: QuestionAttempt[];
}

/** One reactive read model for the Questions tab and its independent session. */
export function useCourseQuestionData(
  courseId: string | undefined,
): CourseQuestionData | undefined {
  return useLiveQuery(async () => {
    if (!courseId) {
      return { questions: [], conceptSets: [], concepts: [], attempts: [] };
    }
    const [questions, conceptSets, concepts, attempts] = await Promise.all([
      db.questions.where('courseId').equals(courseId).toArray(),
      db.questionConcepts.where('courseId').equals(courseId).toArray(),
      db.concepts.where('courseId').equals(courseId).toArray(),
      db.questionAttempts.where('courseId').equals(courseId).toArray(),
    ]);
    questions.sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    );
    concepts.sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
    return { questions, conceptSets, concepts, attempts };
  }, [courseId]);
}

export function useQuestionRecord(questionId: string | undefined) {
  return useLiveQuery(async () => {
    if (!questionId) return null;
    const [question, conceptSet] = await Promise.all([
      db.questions.get(questionId),
      db.questionConcepts.get(questionId),
    ]);
    if (!question) return null;
    if (!conceptSet) throw new Error(`Question ${questionId} has no Concept relationship set.`);
    return { question, conceptSet };
  }, [questionId]);
}
