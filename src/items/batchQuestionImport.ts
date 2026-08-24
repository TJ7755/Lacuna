import { db } from '../db/schema';
import {
  createConcept,
  createFixedQuestion,
  getQuestion,
  listConcepts,
} from '../questions/repository';
import { normaliseConceptName } from '../questions/concepts';
import type { QuestionPayload } from '../questions/types';

export interface BatchFixedQuestionInput {
  courseId: string;
  primaryLessonId: string | null;
  prompt: string;
  payload: QuestionPayload;
  explanation: string;
  targetConceptName: string;
  prerequisiteConceptNames: string[];
  tags?: string[];
}

/**
 * Resolve a staged batch item's named Concept graph and create its fixed
 * Question in one transaction. External generators cannot know local ids, so
 * exact normalised names reuse existing Concepts and genuinely new names are
 * created explicitly before the Question relationship set is written.
 */
export async function createBatchFixedQuestion(input: BatchFixedQuestionInput) {
  return db.transaction(
    'rw',
    [db.courses, db.lessons, db.concepts, db.questions, db.questionConcepts, db.tombstones],
    async () => {
      const existing = await listConcepts(input.courseId);
      const byName = new Map<string, typeof existing>();
      for (const concept of existing) {
        const key = normaliseConceptName(concept.name);
        byName.set(key, [...(byName.get(key) ?? []), concept]);
      }

      async function resolve(name: string) {
        const clean = name.trim().replace(/\s+/g, ' ');
        const key = normaliseConceptName(clean);
        if (!key) throw new Error('A batch Question requires a named target Concept.');
        const matches = byName.get(key) ?? [];
        if (matches.length > 1) {
          throw new Error(`The Concept name "${clean}" is ambiguous in this Course.`);
        }
        if (matches[0]) return matches[0];
        const concept = await createConcept(input.courseId, clean);
        byName.set(key, [concept]);
        return concept;
      }

      const target = await resolve(input.targetConceptName);
      const prerequisiteNames = [
        ...new Map(
          input.prerequisiteConceptNames
            .map((name) => name.trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .map((name) => [normaliseConceptName(name), name]),
        ).values(),
      ];
      if (
        prerequisiteNames.some(
          (name) => normaliseConceptName(name) === normaliseConceptName(input.targetConceptName),
        )
      ) {
        throw new Error('A target Concept cannot also be a prerequisite.');
      }
      const prerequisites = [];
      for (const name of prerequisiteNames) prerequisites.push(await resolve(name));

      const question = await createFixedQuestion({
        courseId: input.courseId,
        primaryLessonId: input.primaryLessonId,
        name: target.name,
        prompt: input.prompt,
        payload: input.payload,
        explanation: input.explanation,
        targetConceptId: target.id,
        prerequisiteConceptIds: prerequisites.map((concept) => concept.id),
        tags: input.tags,
      });
      const record = await getQuestion(question.id);
      if (!record) throw new Error('The staged Question was not persisted.');
      return record;
    },
  );
}
