import {
  answerableNodes,
  type QuestionSetAttemptRecord,
} from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetQuestion } from '@lacuna/core/questions/questionSets';

export function exposedQuestions(attempt: QuestionSetAttemptRecord): QuestionSetQuestion[] {
  const ids = new Set(attempt.shownQuestionIds ?? []);
  const nodes = new Map(
    answerableNodes(attempt.receipt).map((node) => [node.nodeId, node.questionId]),
  );
  const active = nodes.get(attempt.activeNodeId);
  if (active) ids.add(active);
  for (const response of attempt.responses) {
    if (
      (attempt.mode === 'practice' && response.submitted) ||
      [response.draft, response.submitted].some(
        (value) =>
          value &&
          (value.kind === 'multiple-choice'
            ? value.selectedOptionIds.length > 0
            : value.text.trim().length > 0),
      )
    ) {
      const id = nodes.get(response.nodeId);
      if (id) ids.add(id);
    }
  }
  return attempt.receipt.questions.filter((question) => ids.has(question.id));
}
