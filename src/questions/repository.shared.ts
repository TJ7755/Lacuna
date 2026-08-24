import { db } from '../db/schema';
import { itemPayloadIsValid } from '../items/payloadValidation';
import { validateQuestionConceptSet } from './domain';
import type { Concept, QuestionConceptSet, QuestionPayload } from './types';

export function cleanName(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function isQuestionPayload(payload: unknown): payload is QuestionPayload {
  if (!itemPayloadIsValid(payload) || !payload || typeof payload !== 'object') return false;
  const candidate = payload as { v?: unknown; kind?: unknown };
  return candidate.v === 1 && (candidate.kind === 'numeric' || candidate.kind === 'working');
}

export function requireQuestionPayload(payload: unknown): asserts payload is QuestionPayload {
  if (!isQuestionPayload(payload)) {
    throw new Error('A Question requires a valid numeric or working payload.');
  }
}

export function sortedUnique(values: readonly string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return [...new Set(cleaned)].sort();
}

export async function validateLessonMembership(
  courseId: string,
  primaryLessonId: string | null,
  additionalLessonIds: readonly string[],
): Promise<void> {
  const ids = sortedUnique([...(primaryLessonId ? [primaryLessonId] : []), ...additionalLessonIds]);
  if (ids.length === 0) return;
  const lessons = await db.lessons.bulkGet(ids);
  if (
    lessons.some((lesson) => !lesson || lesson.courseId !== courseId) ||
    (primaryLessonId && additionalLessonIds.includes(primaryLessonId))
  ) {
    throw new Error('Every linked Lesson must belong to the Question Course.');
  }
}

export async function validatedConceptSet(args: {
  questionId: string;
  courseId: string;
  targetConceptId: string;
  prerequisiteConceptIds: readonly string[];
  authoringRevisionId: string;
  now: number;
  createdAt?: number;
}): Promise<QuestionConceptSet> {
  const prerequisiteConceptIds = sortedUnique(args.prerequisiteConceptIds);
  const ids = [args.targetConceptId, ...prerequisiteConceptIds];
  const concepts = (await db.concepts.bulkGet(ids)).filter(
    (concept): concept is Concept => concept !== undefined,
  );
  const set: QuestionConceptSet = {
    questionId: args.questionId,
    courseId: args.courseId,
    targetConceptIds: [args.targetConceptId],
    prerequisiteConceptIds,
    authoringRevisionId: args.authoringRevisionId,
    authoringUpdatedAt: args.now,
    createdAt: args.createdAt ?? args.now,
    updatedAt: args.now,
  };
  validateQuestionConceptSet(set, concepts);
  return set;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
