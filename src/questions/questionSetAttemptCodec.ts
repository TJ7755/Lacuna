import { z } from 'zod';
import { parseQuestionSetRecord, type QuestionSetRecord } from './questionSetCodec';
import { answerableNodes, type QuestionSetAttemptRecord } from './questionSetAttempts';
import { summariseSelfMarking } from './questionSets';

const responseValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['written', 'calculation']), text: z.string() }).strict(),
  z.object({ kind: z.literal('multiple-choice'), selectedOptionIds: z.array(z.string()) }).strict(),
]);
const response = z
  .object({
    nodeId: z.string().min(1),
    draft: responseValue,
    submitted: responseValue.optional(),
    submittedAt: z.number().int().nonnegative().optional(),
  })
  .strict();
const decision = z.discriminatedUnion('status', [
  z
    .object({
      allocationId: z.string().min(1),
      status: z.literal('awarded'),
      marks: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ allocationId: z.string().min(1), status: z.literal('unsure') }).strict(),
]);
const annotation = z
  .object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    start: z.number().int().nonnegative().optional(),
    end: z.number().int().nonnegative().optional(),
    comment: z.string(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
const correction = z
  .object({
    nodeId: z.string().min(1),
    content: z.string(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
const reflection = z
  .object({
    reasons: z.array(
      z.enum([
        'forgotten-knowledge',
        'applying-the-idea',
        'misread-question',
        'missing-evidence',
        'calculation-or-units',
        'time',
        'unsure',
      ]),
    ),
    note: z.string(),
  })
  .strict();
const assistance = z
  .object({
    nodeId: z.string().min(1),
    kind: z.enum(['related-knowledge', 'answer-revealed']),
    occurredAt: z.number().int().nonnegative(),
  })
  .strict();
const attemptSchema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    questionSetId: z.string().min(1),
    receipt: z.unknown(),
    mode: z.enum(['practice', 'paper']),
    status: z.enum(['answering', 'marking', 'complete']),
    responses: z.array(response),
    decisions: z.array(decision),
    annotations: z.array(annotation),
    corrections: z.array(correction),
    reflection,
    assistance: z.array(assistance),
    revealedQuestionIds: z.array(z.string()),
    activeNodeId: z.string().min(1),
    activeAllocationId: z.string().nullable(),
    revisionId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    paperSubmittedAt: z.number().int().nonnegative().optional(),
    completedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export function parseQuestionSetAttemptRecord(value: unknown): QuestionSetAttemptRecord {
  const raw = attemptSchema.parse(value);
  const record = structuredClone(raw) as QuestionSetAttemptRecord;
  record.receipt = parseQuestionSetRecord(raw.receipt);
  if (record.receipt.id !== record.questionSetId || record.receipt.courseId !== record.courseId)
    throw new Error('Attempt receipt identity does not match.');
  if (record.updatedAt < record.createdAt) throw new Error('Attempt update predates creation.');
  const nodes = new Map(answerableNodes(record.receipt).map((node) => [node.nodeId, node]));
  const allocations = new Set([...nodes.values()].flatMap((node) => node.allocationIds));
  const responseKinds = new Map<string, string>();
  const responseOptions = new Map<string, { selection: 'single' | 'multiple'; ids: Set<string> }>();
  const allocationMax = new Map<string, number>();
  const allocationNode = new Map<string, string>();
  const registerAnswer = (
    nodeId: string,
    answer: QuestionSetRecord['questions'][number]['answer'],
  ) => {
    if (!answer) return;
    responseKinds.set(nodeId, answer.response.kind);
    if (answer.response.kind === 'multiple-choice') {
      responseOptions.set(nodeId, {
        selection: answer.response.selection,
        ids: new Set(answer.response.options.map((option) => option.id)),
      });
    }
    answer.allocations.forEach((row) => {
      allocationMax.set(row.id, row.maxMarks);
      allocationNode.set(row.id, nodeId);
    });
  };
  for (const question of record.receipt.questions) {
    registerAnswer(question.id, question.answer);
    for (const part of question.parts) {
      registerAnswer(part.id, part.answer);
      for (const subpart of part.subparts) {
        registerAnswer(subpart.id, subpart.answer);
      }
    }
  }
  if (!nodes.has(record.activeNodeId)) throw new Error('Attempt active node is invalid.');
  if (
    record.activeAllocationId !== null &&
    allocationNode.get(record.activeAllocationId) !== record.activeNodeId
  )
    throw new Error('Attempt active allocation is invalid.');
  const validResponseValue = (
    nodeId: string,
    value: QuestionSetAttemptRecord['responses'][number]['draft'],
  ) => {
    if (value.kind !== responseKinds.get(nodeId)) return false;
    if (value.kind !== 'multiple-choice') return true;
    const options = responseOptions.get(nodeId);
    const selected = value.selectedOptionIds;
    return (
      !!options &&
      new Set(selected).size === selected.length &&
      selected.every((id) => options.ids.has(id)) &&
      (options.selection === 'multiple' || selected.length <= 1)
    );
  };
  if (
    record.responses.length !== nodes.size ||
    new Set(record.responses.map((row) => row.nodeId)).size !== nodes.size ||
    record.responses.some(
      (row) =>
        !nodes.has(row.nodeId) ||
        !validResponseValue(row.nodeId, row.draft) ||
        (row.submitted && !validResponseValue(row.nodeId, row.submitted)) ||
        (row.submitted === undefined) !== (row.submittedAt === undefined) ||
        (row.submittedAt !== undefined &&
          (row.submittedAt < record.createdAt ||
            row.submittedAt > record.updatedAt ||
            JSON.stringify(row.submitted) !== JSON.stringify(row.draft))),
    )
  )
    throw new Error('Attempt responses do not match its receipt.');
  const submittedNodes = new Set(
    record.responses.filter((row) => row.submitted).map((row) => row.nodeId),
  );
  if (
    new Set(record.decisions.map((row) => row.allocationId)).size !== record.decisions.length ||
    record.decisions.some(
      (row) =>
        !allocations.has(row.allocationId) ||
        !submittedNodes.has(allocationNode.get(row.allocationId) ?? '') ||
        (row.status === 'awarded' && row.marks > (allocationMax.get(row.allocationId) ?? -1)),
    )
  )
    throw new Error('Attempt decisions do not match its receipt.');
  const annotationIds = new Set<string>();
  if (
    record.annotations.some((row) => {
      if (annotationIds.has(row.id)) return true;
      annotationIds.add(row.id);
      const submitted = record.responses.find(
        (response) => response.nodeId === row.nodeId,
      )?.submitted;
      const textLength =
        submitted && submitted.kind !== 'multiple-choice' ? submitted.text.length : 0;
      return (
        !submittedNodes.has(row.nodeId) ||
        (row.start === undefined) !== (row.end === undefined) ||
        (row.start !== undefined && (row.end! < row.start || row.end! > textLength))
      );
    })
  )
    throw new Error('Attempt annotations do not match submitted responses.');
  if (
    new Set(record.corrections.map((row) => row.nodeId)).size !== record.corrections.length ||
    record.corrections.some(
      (row) =>
        !submittedNodes.has(row.nodeId) ||
        row.updatedAt < record.createdAt ||
        row.updatedAt > record.updatedAt,
    )
  )
    throw new Error('Attempt corrections do not match submitted responses.');
  if (new Set(record.reflection.reasons).size !== record.reflection.reasons.length) {
    throw new Error('Attempt reflection reasons must be unique.');
  }
  if (
    record.assistance.some((row) => !nodes.has(row.nodeId) || row.occurredAt < record.createdAt)
  ) {
    throw new Error('Attempt assistance does not match its receipt.');
  }
  const questionIds = new Set(record.receipt.questions.map((question) => question.id));
  if (
    new Set(record.revealedQuestionIds).size !== record.revealedQuestionIds.length ||
    record.revealedQuestionIds.some((id) => !questionIds.has(id))
  )
    throw new Error('Attempt revealed questions do not match its receipt.');
  const allSubmitted = submittedNodes.size === nodes.size;
  if (record.mode === 'paper') {
    const paperSubmitted = record.paperSubmittedAt !== undefined;
    if (
      paperSubmitted !== allSubmitted ||
      (record.paperSubmittedAt !== undefined &&
        (record.paperSubmittedAt < record.createdAt ||
          record.paperSubmittedAt > record.updatedAt)) ||
      record.revealedQuestionIds.length !== (paperSubmitted ? questionIds.size : 0)
    ) {
      throw new Error('Paper submission and feedback state are inconsistent.');
    }
  } else {
    if (record.paperSubmittedAt !== undefined)
      throw new Error('Practice attempts cannot submit a paper.');
    for (const questionId of record.revealedQuestionIds) {
      if (
        answerableNodes(record.receipt).some(
          (node) => node.questionId === questionId && !submittedNodes.has(node.nodeId),
        )
      ) {
        throw new Error('Practice feedback cannot precede question submission.');
      }
    }
  }
  if (
    (record.status !== 'answering' && !allSubmitted) ||
    (record.status === 'complete') !== (record.completedAt !== undefined) ||
    (record.completedAt !== undefined &&
      (record.completedAt < record.createdAt || record.completedAt > record.updatedAt))
  ) {
    throw new Error('Attempt lifecycle state is inconsistent.');
  }
  if (
    record.status === 'complete' &&
    summariseSelfMarking(record.receipt, record.decisions).status !== 'complete'
  )
    throw new Error('Completed attempt has unresolved marks.');
  return record;
}
