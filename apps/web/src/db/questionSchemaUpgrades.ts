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
