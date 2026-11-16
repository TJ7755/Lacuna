import { db } from '../db/schema';
import { transitionIndividualQuestions } from './questionTransition';

/** Also covers direct MCP writes and shared-course imports after the schema upgrade. */
export async function ensureQuestionTransition(
  courseId: string,
  refresh: boolean | ReadonlySet<string> = false,
): Promise<void> {
  await db.transaction(
    'rw',
    [db.questions, db.questionConcepts, db.questionSets, db.tombstones],
    async () => {
      const [questions, links, sets, tombstones] = await Promise.all([
        db.questions.where('courseId').equals(courseId).toArray(),
        db.questionConcepts.where('courseId').equals(courseId).toArray(),
        db.questionSets.where('courseId').equals(courseId).toArray(),
        db.tombstones.toArray(),
      ]);
      const migrated = transitionIndividualQuestions(questions, links, sets, tombstones, refresh);
      const newSets = migrated.questionSets.filter(
        (row) =>
          !sets.some((set) => set.id === row.id && set.contentRevisionId === row.contentRevisionId),
      );
      const changed = migrated.questions.filter(
        (row, index) => row.migratedToSetId !== questions[index].migratedToSetId,
      );
      if (newSets.length) await db.questionSets.bulkPut(newSets);
      if (changed.length) await db.questions.bulkPut(changed);
    },
  );
}
