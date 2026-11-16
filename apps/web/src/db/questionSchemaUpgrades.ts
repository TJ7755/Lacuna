import type { Transaction } from 'dexie';
import Dexie from 'dexie';
import type { PracticeNode, LineageIdMapping } from '@lacuna/core/db/types';

export async function upgradeQuestionSetActivities(tx: Transaction): Promise<void> {
  const { parseQuestionSetPracticeNode, normalisePracticeNodeLineage } = await Dexie.waitFor(
    import('./questionSetPracticeNode'),
  );
  await tx
    .table<PracticeNode, string>('practiceNodes')
    .toCollection()
    .modify((node, ref) => {
      if (node.type === 'question-set') ref.value = parseQuestionSetPracticeNode(node);
    });
  await tx
    .table<LineageIdMapping, string>('lineageIdMappings')
    .toCollection()
    .modify((mapping, ref) => {
      ref.value = normalisePracticeNodeLineage(mapping);
    });
}

export async function upgradeIndividualQuestions(tx: Transaction): Promise<void> {
  const { transitionIndividualQuestions } = await Dexie.waitFor(
    import('../questions/questionTransition'),
  );
  const [questions, links, sets, tombstones] = await Promise.all([
    tx.table('questions').toArray(),
    tx.table('questionConcepts').toArray(),
    tx.table('questionSets').toArray(),
    tx.table('tombstones').toArray(),
  ]);
  const migrated = transitionIndividualQuestions(questions, links, sets, tombstones);
  await tx.table('questions').bulkPut(migrated.questions);
  await tx.table('questionSets').bulkPut(migrated.questionSets);
}
