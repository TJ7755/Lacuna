import type { LineageIdMapping } from '@lacuna/core/db/types';
import { parseQuestionSetPracticeNodeSnapshot } from '@lacuna/core/db/questionSetPracticeNode';

export {
  assertQuestionSetPracticeNodeReferences,
  parseQuestionSetPracticeNode,
  parseQuestionSetPracticeNodeSnapshot,
} from '@lacuna/core/db/questionSetPracticeNode';

export function normalisePracticeNodeLineage(mapping: LineageIdMapping): LineageIdMapping {
  if (!mapping.questionSetPracticeNodeSnapshots) return mapping;
  return {
    ...mapping,
    questionSetPracticeNodeSnapshots: Object.fromEntries(
      Object.entries(mapping.questionSetPracticeNodeSnapshots).map(([id, snapshot]) => [
        id,
        parseQuestionSetPracticeNodeSnapshot(snapshot),
      ]),
    ),
  };
}
