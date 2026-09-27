import { db, makeId } from '../db/schema';
import { parseQuestionSetRecord } from './questionSetCodec';
import { parseQuestionSetAttemptRecord } from './questionSetAttemptCodec';
import {
  answerableNodes,
  type QuestionSetAttemptAnnotation,
  type QuestionSetAttemptCorrection,
  type QuestionSetAttemptMode,
  type QuestionSetAttemptRecord,
  type QuestionSetAttemptReflection,
  type QuestionSetAssistanceEvent,
  type QuestionSetResponseValue,
} from './questionSetAttempts';
import { summariseSelfMarking, type SelfMarkDecision } from './questionSets';

export class QuestionSetAttemptRevisionConflictError extends Error {
  constructor() {
    super('The attempt changed since it was opened.');
    this.name = 'QuestionSetAttemptRevisionConflictError';
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function emptyResponse(
  kind: 'written' | 'calculation' | 'multiple-choice',
): QuestionSetResponseValue {
  return kind === 'multiple-choice' ? { kind, selectedOptionIds: [] } : { kind, text: '' };
}

export async function startQuestionSetAttempt(
  questionSetId: string,
  mode: QuestionSetAttemptMode,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return db.transaction('rw', [db.courses, db.questionSets, db.questionSetAttempts], async () => {
    const receiptRaw = await db.questionSets.get(questionSetId);
    if (!receiptRaw) throw new Error('Question Set not found.');
    const receipt = parseQuestionSetRecord(receiptRaw);
    if (!(await db.courses.get(receipt.courseId))) throw new Error('Course not found.');
    const nodes = answerableNodes(receipt);
    const responseKind = new Map<string, 'written' | 'calculation' | 'multiple-choice'>();
    for (const question of receipt.questions) {
      if (question.answer) responseKind.set(question.id, question.answer.response.kind);
      for (const part of question.parts) {
        if (part.answer) responseKind.set(part.id, part.answer.response.kind);
        for (const subpart of part.subparts) {
          if (subpart.answer) responseKind.set(subpart.id, subpart.answer.response.kind);
        }
      }
    }
    const record = parseQuestionSetAttemptRecord({
      id: makeId(),
      courseId: receipt.courseId,
      questionSetId,
      receipt: clone(receipt),
      mode,
      status: 'answering',
      responses: nodes.map((node) => ({
        nodeId: node.nodeId,
        draft: emptyResponse(responseKind.get(node.nodeId)!),
      })),
      decisions: [],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      assistance: [],
      revealedQuestionIds: [],
      activeNodeId: nodes[0].nodeId,
      activeAllocationId: null,
      revisionId: makeId(),
      createdAt: now,
      updatedAt: now,
    });
    await db.questionSetAttempts.add(record);
    return record;
  });
}

export async function getQuestionSetAttempt(id: string): Promise<QuestionSetAttemptRecord | null> {
  const row = await db.questionSetAttempts.get(id);
  return row ? parseQuestionSetAttemptRecord(row) : null;
}

export async function listQuestionSetAttempts(
  questionSetId: string,
): Promise<QuestionSetAttemptRecord[]> {
  const rows = await db.questionSetAttempts.where('questionSetId').equals(questionSetId).toArray();
  return rows
    .map(parseQuestionSetAttemptRecord)
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

/** Attempts whose authored set has been removed, scoped to the owning Course. */
export async function listRemovedQuestionSetAttempts(
  courseId: string,
): Promise<QuestionSetAttemptRecord[]> {
  return db.transaction('r', [db.questionSets, db.questionSetAttempts], async () => {
    const [sets, attempts] = await Promise.all([
      db.questionSets.where('courseId').equals(courseId).toArray(),
      db.questionSetAttempts.where('courseId').equals(courseId).toArray(),
    ]);
    const liveSetIds = new Set(sets.map((set) => set.id));
    return attempts
      .filter((attempt) => !liveSetIds.has(attempt.questionSetId))
      .map(parseQuestionSetAttemptRecord)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  });
}

async function mutate(
  id: string,
  expectedRevisionId: string,
  now: number,
  change: (record: QuestionSetAttemptRecord) => void,
): Promise<QuestionSetAttemptRecord> {
  return db.transaction('rw', db.questionSetAttempts, async () => {
    const raw = await db.questionSetAttempts.get(id);
    if (!raw) throw new Error('Question Set attempt not found.');
    const current = parseQuestionSetAttemptRecord(raw);
    if (current.revisionId !== expectedRevisionId)
      throw new QuestionSetAttemptRevisionConflictError();
    const next = clone(current);
    change(next);
    next.revisionId = makeId();
    next.updatedAt = Math.max(now, current.updatedAt + 1);
    const parsed = parseQuestionSetAttemptRecord(next);
    await db.questionSetAttempts.put(parsed);
    return parsed;
  });
}

export function saveQuestionSetResponseDraft(
  id: string,
  expectedRevisionId: string,
  nodeId: string,
  draft: QuestionSetResponseValue,
  activeNodeId: string,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    if (attempt.status !== 'answering')
      throw new Error('Responses can only be edited while answering.');
    const response = attempt.responses.find((row) => row.nodeId === nodeId);
    if (!response) throw new Error('Answerable node not found.');
    if (response.submitted) throw new Error('A submitted response is immutable.');
    response.draft = clone(draft);
    attempt.activeNodeId = activeNodeId;
  });
}

export function submitPracticeQuestion(
  id: string,
  expectedRevisionId: string,
  questionId: string,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    if (attempt.mode !== 'practice' || attempt.status !== 'answering')
      throw new Error('This attempt is not answering in Practice mode.');
    const nodeIds = answerableNodes(attempt.receipt)
      .filter((node) => node.questionId === questionId)
      .map((node) => node.nodeId);
    if (!nodeIds.length) throw new Error('Question not found.');
    for (const response of attempt.responses.filter((row) => nodeIds.includes(row.nodeId))) {
      if (!response.submitted) {
        response.submitted = clone(response.draft);
        response.submittedAt = now;
      }
    }
    if (!attempt.revealedQuestionIds.includes(questionId))
      attempt.revealedQuestionIds.push(questionId);
    if (attempt.responses.every((response) => response.submitted)) attempt.status = 'marking';
  });
}

export function submitQuestionSetPaper(
  id: string,
  expectedRevisionId: string,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    if (attempt.mode !== 'paper' || attempt.status !== 'answering')
      throw new Error('This attempt is not answering in Paper mode.');
    for (const response of attempt.responses) {
      response.submitted = clone(response.draft);
      response.submittedAt = now;
    }
    attempt.paperSubmittedAt = now;
    attempt.revealedQuestionIds = attempt.receipt.questions.map((question) => question.id);
    attempt.status = 'marking';
  });
}

export interface SaveQuestionSetMarkingInput {
  decisions: SelfMarkDecision[];
  annotations: QuestionSetAttemptAnnotation[];
  corrections: QuestionSetAttemptCorrection[];
  reflection: QuestionSetAttemptReflection;
  activeNodeId: string;
  activeAllocationId: string | null;
}

export function saveQuestionSetMarking(
  id: string,
  expectedRevisionId: string,
  input: SaveQuestionSetMarkingInput,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    const submittedNodes = new Set(
      attempt.responses.filter((response) => response.submitted).map((response) => response.nodeId),
    );
    const allocationNode = new Map(
      answerableNodes(attempt.receipt).flatMap((node) =>
        node.allocationIds.map((allocationId) => [allocationId, node.nodeId] as const),
      ),
    );
    if (
      input.decisions.some(
        (decision) => !submittedNodes.has(allocationNode.get(decision.allocationId) ?? ''),
      )
    ) {
      throw new Error('Submit a response before marking its allocations.');
    }
    if (
      [...input.annotations, ...input.corrections].some(
        (entry) => !submittedNodes.has(entry.nodeId),
      )
    ) {
      throw new Error('Submit a response before annotating or correcting it.');
    }
    Object.assign(attempt, clone(input));
  });
}

export function saveQuestionSetAttemptPosition(
  id: string,
  expectedRevisionId: string,
  activeNodeId: string,
  activeAllocationId: string | null,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    attempt.activeNodeId = activeNodeId;
    attempt.activeAllocationId = activeAllocationId;
  });
}

export function recordQuestionSetAssistance(
  id: string,
  expectedRevisionId: string,
  event: QuestionSetAssistanceEvent,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    attempt.assistance.push(clone(event));
  });
}

export function completeQuestionSetAttempt(
  id: string,
  expectedRevisionId: string,
  now = Date.now(),
): Promise<QuestionSetAttemptRecord> {
  return mutate(id, expectedRevisionId, now, (attempt) => {
    if (attempt.status !== 'marking') throw new Error('The attempt is not ready to complete.');
    if (summariseSelfMarking(attempt.receipt, attempt.decisions).status !== 'complete') {
      throw new Error('Resolve every marking decision before completing the attempt.');
    }
    attempt.status = 'complete';
    attempt.completedAt = now;
  });
}
