import { clearTombstone } from '../db/mutationStamp';
import { db } from '../db/schema';
import { validateQuestionConceptSet } from './domain';
import { requireQuestionPayload, validateLessonMembership } from './repository.shared';
import type { Concept, QuestionConceptSet, QuestionDefinition } from './types';

export type ConceptSnapshot = Concept;

export async function snapshotConcept(conceptId: string): Promise<ConceptSnapshot | null> {
  return (await db.concepts.get(conceptId)) ?? null;
}

/** Restore a Concept deleted by an undoable operation without weakening its scope. */
export async function restoreConcept(snapshot: ConceptSnapshot): Promise<void> {
  await db.transaction(
    'rw',
    [db.courses, db.schedulingUnits, db.concepts, db.tombstones],
    async (tx) => {
      if (!snapshot.id.trim() || !snapshot.name.trim()) {
        throw new Error('A Concept snapshot requires an id and name.');
      }
      if (snapshot.scope === 'course') {
        if (!(await db.courses.get(snapshot.courseId))) {
          throw new Error('A Concept snapshot references a missing Course.');
        }
        if (snapshot.scopeKey !== `course:${snapshot.courseId}`) {
          throw new Error('A Concept snapshot has an invalid Course scope.');
        }
      } else {
        if (!snapshot.provisional) {
          throw new Error('A legacy scheduling-unit Concept must remain provisional.');
        }
        if (!(await db.schedulingUnits.get(snapshot.legacySchedulingUnitId))) {
          throw new Error('A Concept snapshot references a missing scheduling unit.');
        }
        if (snapshot.scopeKey !== `legacy-scheduling-unit:${snapshot.legacySchedulingUnitId}`) {
          throw new Error('A Concept snapshot has an invalid legacy scope.');
        }
      }
      await db.concepts.put(snapshot);
      await clearTombstone(tx, 'concepts', snapshot.id);
    },
  );
}

export interface QuestionSnapshot {
  question: QuestionDefinition;
  concepts: QuestionConceptSet;
}

export async function snapshotQuestion(questionId: string): Promise<QuestionSnapshot | null> {
  const [question, concepts] = await Promise.all([
    db.questions.get(questionId),
    db.questionConcepts.get(questionId),
  ]);
  if (!question) return null;
  if (!concepts) throw new Error(`Question ${questionId} has no Concept relationship set.`);
  return { question, concepts };
}

/** Restore authored Question state; immutable attempts deliberately remain in place. */
export async function restoreQuestion(snapshot: QuestionSnapshot): Promise<void> {
  const { question, concepts } = snapshot;
  await db.transaction(
    'rw',
    [db.courses, db.lessons, db.concepts, db.questions, db.questionConcepts, db.tombstones],
    async (tx) => {
      if (
        concepts.questionId !== question.id ||
        concepts.courseId !== question.courseId ||
        concepts.authoringRevisionId !== question.authoringRevisionId
      ) {
        throw new Error('A Question snapshot has an incoherent Concept relationship set.');
      }
      if (!(await db.courses.get(question.courseId))) {
        throw new Error('A Question snapshot references a missing Course.');
      }
      await validateLessonMembership(
        question.courseId,
        question.primaryLessonId,
        question.additionalLessonIds,
      );
      const conceptIds = [...concepts.targetConceptIds, ...concepts.prerequisiteConceptIds];
      const referencedConcepts = await db.concepts.bulkGet(conceptIds);
      if (
        referencedConcepts.some(
          (concept) =>
            !concept || concept.scope !== 'course' || concept.courseId !== question.courseId,
        )
      ) {
        throw new Error('A Question snapshot references a missing or foreign Concept.');
      }
      validateQuestionConceptSet(
        concepts,
        referencedConcepts.filter((concept): concept is Concept => concept !== undefined),
      );
      if (question.kind === 'fixed') {
        requireQuestionPayload(question.payload);
        if (!question.prompt.trim() || !question.explanation.trim()) {
          throw new Error('A fixed Question snapshot requires a prompt and worked explanation.');
        }
      } else if (
        !question.generatorKey.trim() ||
        !Number.isSafeInteger(question.generatorVersion)
      ) {
        throw new Error('A generated Question snapshot has an invalid generator identity.');
      }
      await db.questions.put(question);
      await db.questionConcepts.put(concepts);
      await clearTombstone(tx, 'questions', question.id);
      await clearTombstone(tx, 'questionConcepts', question.id);
    },
  );
}

export async function remediationCardsForQuestion(questionId: string) {
  const set = await db.questionConcepts.get(questionId);
  if (!set) return [];
  const orderedConceptIds = [...set.targetConceptIds, ...set.prerequisiteConceptIds];
  const cards =
    orderedConceptIds.length === 0
      ? []
      : await db.cards.where('conceptId').anyOf(orderedConceptIds).toArray();
  return orderedConceptIds.flatMap((conceptId) => {
    const candidates = cards
      .filter((card) => card.conceptId === conceptId && !card.suspended)
      .sort((left, right) => {
        if (left.due === null && right.due !== null) return -1;
        if (left.due !== null && right.due === null) return 1;
        return (left.due ?? 0) - (right.due ?? 0) || left.id.localeCompare(right.id);
      });
    return candidates.slice(0, 1);
  });
}
