import {
  answerableNodes,
  type QuestionSetAttemptRecord,
} from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';

/** New answerable parts are current work, separate from the attempt's historical progress. */
export function questionSetAddedParts(
  content: QuestionSetRecord,
  attempt: QuestionSetAttemptRecord | null,
): number {
  if (!attempt) return 0;
  const previous = new Set(answerableNodes(attempt.receipt).map((part) => part.nodeId));
  return answerableNodes(content).filter((part) => !previous.has(part.nodeId)).length;
}

export interface QuestionSetPathProgress {
  totalParts: number;
  answeredParts: number;
  markedParts: number;
}

function hasResponse(
  value: NonNullable<QuestionSetAttemptRecord['responses'][number]['submitted']>,
) {
  return value.kind === 'multiple-choice'
    ? value.selectedOptionIds.length > 0
    : value.text.trim().length > 0;
}

/** Describe completion of one attempt from its immutable receipt and saved responses. */
export function questionSetPathProgress(
  attempt: QuestionSetAttemptRecord | null,
): QuestionSetPathProgress | null {
  if (!attempt) return null;
  const parts = answerableNodes(attempt.receipt);
  const decisions = new Map(attempt.decisions.map((decision) => [decision.allocationId, decision]));
  return {
    totalParts: parts.length,
    answeredParts: parts.filter((part) => {
      const response = attempt.responses.find((row) => row.nodeId === part.nodeId);
      return hasResponse(response?.submitted ?? response?.draft ?? { kind: 'written', text: '' });
    }).length,
    markedParts: parts.filter(
      (part) =>
        part.allocationIds.length > 0 &&
        part.allocationIds.every((id) => decisions.get(id)?.status === 'awarded'),
    ).length,
  };
}
