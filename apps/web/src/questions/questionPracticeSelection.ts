import { db } from '../db/schema';
import { declarativeFamilyCapacity, resolveFamilyVariant } from './bank';
import {
  familyPresentationRevision,
  questionPresentationFingerprint as conceptPracticeFingerprint,
} from './generators/declarative';
import { parseQuestionSetAttemptRecord } from './questionSetAttemptCodec';
import {
  answerableNodes,
  type QuestionSetAttemptRecord,
} from '@lacuna/core/questions/questionSetAttempts';
import {
  parseQuestionSetRecord,
  type QuestionSetRecord,
} from '@lacuna/core/questions/questionSetCodec';
import type {
  MarkAllocation,
  QuestionAnswer,
  QuestionSetQuestion,
} from '@lacuna/core/questions/questionSets';

export class QuestionPracticeExhaustedError extends Error {
  constructor(public readonly reason: 'no-unseen-questions' | 'no-questions') {
    super(
      reason === 'no-unseen-questions'
        ? 'No unseen questions remain. Choose familiar practice explicitly.'
        : 'No eligible questions are available.',
    );
  }
}

export function answers(
  question: QuestionSetQuestion,
): Array<{ nodeId: string; answer: QuestionAnswer }> {
  return [
    ...(question.answer ? [{ nodeId: question.id, answer: question.answer }] : []),
    ...question.parts.flatMap((part) => [
      ...(part.answer ? [{ nodeId: part.id, answer: part.answer }] : []),
      ...part.subparts.flatMap((subpart) =>
        subpart.answer ? [{ nodeId: subpart.id, answer: subpart.answer }] : [],
      ),
    ]),
  ];
}

function exposedQuestions(attempt: QuestionSetAttemptRecord): QuestionSetQuestion[] {
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

interface Candidate {
  set: QuestionSetRecord;
  question: QuestionSetQuestion;
  fingerprint: string;
  sibling: string;
  conceptIds: string[];
  capacity: number;
}
function candidates(sets: QuestionSetRecord[]): Candidate[] {
  return sets.flatMap((set) =>
    set.questions.map((question) => ({
      set,
      question,
      capacity: set.bank?.family ? declarativeFamilyCapacity(set.bank.family) : 1,
      fingerprint: conceptPracticeFingerprint(question),
      sibling: set.bank ? `${set.bank.bankId}:${set.bank.family?.id ?? set.bank.setId}` : set.id,
      conceptIds: [
        ...new Set(
          answers(question).flatMap(({ answer }) =>
            answer.allocations
              .filter(
                (allocation: MarkAllocation) =>
                  allocation.dimension !== 'knowledge' && allocation.targetConceptIds.length === 1,
              )
              .flatMap((allocation) => allocation.targetConceptIds),
          ),
        ),
      ],
    })),
  );
}

function familyKey(set: QuestionSetRecord, questionId: string): string {
  const family = set.bank?.family;
  return family
    ? `${set.bank!.bankId}:${family.id}:${familyPresentationRevision(family, questionId)}:${questionId}`
    : `${set.id}:${questionId}`;
}

export async function practiceContext(courseId: string) {
  const [concepts, sets, attempts] = await Promise.all([
    db.concepts.where('courseId').equals(courseId).toArray(),
    db.questionSets.where('courseId').equals(courseId).toArray(),
    db.questionSetAttempts.where('courseId').equals(courseId).toArray(),
  ]);
  const records = attempts.map(parseQuestionSetAttemptRecord);
  const currentSets = sets.map(parseQuestionSetRecord);
  const seen = new Set(
    records.flatMap((attempt) => exposedQuestions(attempt).map(conceptPracticeFingerprint)),
  );
  const seenVariants = new Map<string, Set<number>>();
  for (const attempt of records) {
    const bank = attempt.receipt.bank;
    if (!bank?.family || !bank.variant) continue;
    for (const question of exposedQuestions(attempt)) {
      const key = familyKey(attempt.receipt, question.id);
      const indices = seenVariants.get(key) ?? new Set<number>();
      indices.add(bank.variant.index);
      seenVariants.set(key, indices);
    }
  }
  return {
    seenVariants,
    concepts: concepts.filter((concept) => concept.scope === 'course'),
    candidates: candidates(currentSets),
    sets: currentSets,
    attempts: records,
    seen,
  };
}

export function unseenCapacity(
  candidate: Candidate,
  data: Awaited<ReturnType<typeof practiceContext>>,
): number {
  if (!candidate.set.bank?.family) return data.seen.has(candidate.fingerprint) ? 0 : 1;
  return Math.max(
    0,
    candidate.capacity -
      (data.seenVariants.get(familyKey(candidate.set, candidate.question.id))?.size ?? 0),
  );
}

export function selectPracticeQuestion(
  data: Awaited<ReturnType<typeof practiceContext>>,
  available: Candidate[],
  options: { allowFamiliar?: boolean; mode?: 'due' | 'mixed' },
  priority: (a: Candidate, b: Candidate) => number = () => 0,
  schedulePriority: (a: Candidate, b: Candidate) => number = () => 0,
) {
  if (!available.length) throw new QuestionPracticeExhaustedError('no-questions');
  const cellKey = (set: QuestionSetRecord) =>
    set.bank
      ? JSON.stringify([
          set.bank.blueprint.type,
          set.bank.blueprint.difficulty,
          set.bank.blueprint.context,
        ])
      : 'unclassified';
  const cellExposures = new Map<string, number>();
  for (const attempt of data.attempts) {
    const key = cellKey(attempt.receipt);
    cellExposures.set(key, (cellExposures.get(key) ?? 0) + 1);
  }
  const recent = new Set(
    data.attempts
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map((attempt) =>
        attempt.receipt.bank
          ? `${attempt.receipt.bank.bankId}:${attempt.receipt.bank.family?.id ?? attempt.receipt.bank.setId}`
          : attempt.questionSetId,
      ),
  );
  const pool = available.filter(
    (candidate) => options.allowFamiliar || unseenCapacity(candidate, data) > 0,
  );
  if (!pool.length) throw new QuestionPracticeExhaustedError('no-unseen-questions');
  pool.sort(
    (a, b) =>
      Number(unseenCapacity(a, data) === 0) - Number(unseenCapacity(b, data) === 0) ||
      priority(a, b) ||
      (options.mode !== 'due'
        ? (cellExposures.get(cellKey(a.set)) ?? 0) - (cellExposures.get(cellKey(b.set)) ?? 0)
        : 0) ||
      Number(recent.has(a.sibling)) - Number(recent.has(b.sibling)) ||
      schedulePriority(a, b) ||
      a.set.id.localeCompare(b.set.id) ||
      a.question.id.localeCompare(b.question.id),
  );
  // Families receive one place in the pool, irrespective of Cartesian capacity.
  // Only the selected family's variants are resolved, and known indices are skipped.
  let selected:
    | {
        candidate: Candidate;
        set: QuestionSetRecord;
        question: QuestionSetQuestion;
        fingerprint: string;
        index?: number;
      }
    | undefined;
  for (const familiar of options.allowFamiliar ? [false, true] : [false]) {
    for (const candidate of pool) {
      const used = data.seenVariants.get(familyKey(candidate.set, candidate.question.id));
      for (let index = 0; index < candidate.capacity; index++) {
        if (candidate.set.bank?.family && !familiar && used?.has(index)) continue;
        const set = candidate.set.bank?.family
          ? resolveFamilyVariant(candidate.set, index)
          : candidate.set;
        const question = set.questions.find((row) => row.id === candidate.question.id)!;
        const fingerprint = conceptPracticeFingerprint(question);
        if (data.seen.has(fingerprint) !== familiar) continue;
        selected = {
          candidate,
          set,
          question,
          fingerprint,
          index: set.bank?.family ? index : undefined,
        };
        break;
      }
      if (selected) break;
    }
    if (selected) break;
  }
  if (!selected) throw new QuestionPracticeExhaustedError('no-unseen-questions');
  return {
    ...selected,
    novelty: data.seen.has(selected.fingerprint) ? ('familiar' as const) : ('unseen' as const),
  };
}
