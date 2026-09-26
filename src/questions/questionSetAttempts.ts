import type { QuestionSetRecord } from './questionSetCodec';
import type { SelfMarkDecision } from './questionSets';

export type QuestionSetAttemptMode = 'practice' | 'paper';
export type QuestionSetAttemptStatus = 'answering' | 'marking' | 'complete';

export type QuestionSetResponseValue =
  | { kind: 'written' | 'calculation'; text: string }
  | { kind: 'multiple-choice'; selectedOptionIds: string[] };

export interface QuestionSetAttemptResponse {
  nodeId: string;
  draft: QuestionSetResponseValue;
  /** Captured once. Later corrections never rewrite this evidence. */
  submitted?: QuestionSetResponseValue;
  submittedAt?: number;
}

export interface QuestionSetAttemptAnnotation {
  id: string;
  nodeId: string;
  start?: number;
  end?: number;
  comment: string;
  createdAt: number;
}

export interface QuestionSetAttemptCorrection {
  nodeId: string;
  content: string;
  updatedAt: number;
}

export type QuestionSetReflectionReason =
  | 'forgotten-knowledge'
  | 'applying-the-idea'
  | 'misread-question'
  | 'missing-evidence'
  | 'calculation-or-units'
  | 'time'
  | 'unsure';

export interface QuestionSetAttemptReflection {
  reasons: QuestionSetReflectionReason[];
  note: string;
}

export interface QuestionSetAssistanceEvent {
  nodeId: string;
  kind: 'related-knowledge' | 'answer-revealed';
  occurredAt: number;
}

export interface QuestionSetAttemptRecord {
  id: string;
  courseId: string;
  questionSetId: string;
  /** Full immutable authored content and scheme shown for this attempt. */
  receipt: QuestionSetRecord;
  mode: QuestionSetAttemptMode;
  status: QuestionSetAttemptStatus;
  responses: QuestionSetAttemptResponse[];
  decisions: SelfMarkDecision[];
  annotations: QuestionSetAttemptAnnotation[];
  corrections: QuestionSetAttemptCorrection[];
  reflection: QuestionSetAttemptReflection;
  assistance: QuestionSetAssistanceEvent[];
  revealedQuestionIds: string[];
  activeNodeId: string;
  activeAllocationId: string | null;
  revisionId: string;
  createdAt: number;
  updatedAt: number;
  paperSubmittedAt?: number;
  completedAt?: number;
}

export function answerableNodes(receipt: QuestionSetRecord): Array<{
  nodeId: string;
  questionId: string;
  allocationIds: string[];
}> {
  return receipt.questions.flatMap((question) => {
    const rows: Array<{ nodeId: string; questionId: string; allocationIds: string[] }> = [];
    if (question.answer) {
      rows.push({
        nodeId: question.id,
        questionId: question.id,
        allocationIds: question.answer.allocations.map((allocation) => allocation.id),
      });
    }
    for (const part of question.parts) {
      if (part.answer) {
        rows.push({
          nodeId: part.id,
          questionId: question.id,
          allocationIds: part.answer.allocations.map((allocation) => allocation.id),
        });
      }
      for (const subpart of part.subparts) {
        if (subpart.answer) {
          rows.push({
            nodeId: subpart.id,
            questionId: question.id,
            allocationIds: subpart.answer.allocations.map((allocation) => allocation.id),
          });
        }
      }
    }
    return rows;
  });
}

export function feedbackAvailable(attempt: QuestionSetAttemptRecord, questionId: string): boolean {
  return attempt.mode === 'paper'
    ? attempt.paperSubmittedAt !== undefined
    : attempt.revealedQuestionIds.includes(questionId);
}
