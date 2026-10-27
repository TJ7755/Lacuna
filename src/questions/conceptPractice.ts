import { db } from '../db/schema';
import { declarativeFamilyCapacity, resolveFamilyVariant } from './bank';
import {
  familyPresentationRevision,
  questionPresentationFingerprint as conceptPracticeFingerprint,
} from './generators/declarative';
import { parseQuestionSetAttemptRecord } from './questionSetAttemptCodec';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  answerableNodes,
  type ConceptPracticeSelection,
  type QuestionSetAttemptRecord,
} from './questionSetAttempts';
import { parseQuestionSetRecord, type QuestionSetRecord } from './questionSetCodec';
import type { MarkAllocation, QuestionAnswer, QuestionSetQuestion } from './questionSets';
import { emptyQuestionSchedule, scheduleQuestionReview } from './scheduler';
import type { QuestionScheduleState } from './types';
import {
  deriveConceptDiagnosticEvidence,
  deriveConceptPracticeNeeds,
  questionGapPriority,
  type ConceptPracticeNeeds,
  type DiagnosticCategoryEvidence,
} from './techniqueEvidence';
import type { TechniqueId } from './techniqueTags';

export { undoConceptPracticeAttempt } from './questionSetAttemptRepository';
export { questionPresentationFingerprint as conceptPracticeFingerprint } from './generators/declarative';

function answers(question: QuestionSetQuestion): Array<{ nodeId: string; answer: QuestionAnswer }> {
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

/** Criterion totals retain partial credit. Ambiguous or unresolved evidence cannot move a schedule. */
export function deriveConceptApplicationSchedules(
  attempts: readonly QuestionSetAttemptRecord[],
): Map<string, QuestionScheduleState> {
  const schedules = new Map<string, QuestionScheduleState>();
  const events = attempts
    .filter((attempt) => attempt.undoneAt === undefined)
    .flatMap((attempt) => (attempt.firstMarking ?? []).map((snapshot) => ({ attempt, snapshot })))
    .sort(
      (a, b) =>
        a.snapshot.recordedAt - b.snapshot.recordedAt ||
        a.attempt.id.localeCompare(b.attempt.id) ||
        a.snapshot.questionId.localeCompare(b.snapshot.questionId),
    );
  for (const { attempt, snapshot } of events) {
    if (attempt.disputedQuestionIds?.includes(snapshot.questionId)) continue;
    const question = attempt.receipt.questions.find((row) => row.id === snapshot.questionId);
    if (!question) continue;
    const nodes = answers(question);
    // Assistance on any part contaminates the original question, including follow-through work.
    if (
      attempt.assistance.some(
        (event) =>
          nodes.some((node) => node.nodeId === event.nodeId) &&
          event.occurredAt <= snapshot.recordedAt,
      )
    )
      continue;
    const decisions = new Map(snapshot.decisions.map((row) => [row.allocationId, row]));
    const totals = new Map<string, { earned: number; available: number; unresolved: boolean }>();
    for (const { answer } of nodes)
      for (const allocation of answer.allocations) {
        for (const conceptId of allocation.targetConceptIds) {
          const total = totals.get(conceptId) ?? { earned: 0, available: 0, unresolved: false };
          const decision = decisions.get(allocation.id);
          total.available += allocation.maxMarks;
          if (allocation.targetConceptIds.length !== 1 || decision?.status !== 'awarded')
            total.unresolved = true;
          else total.earned += decision.marks;
          totals.set(conceptId, total);
        }
      }
    for (const [conceptId, total] of totals) {
      if (total.unresolved || !total.available) continue;
      const grade = total.earned === total.available ? 3 : 1;
      schedules.set(
        conceptId,
        scheduleQuestionReview(
          schedules.get(conceptId) ?? emptyQuestionSchedule(),
          grade,
          snapshot.schedulerConfig,
          snapshot.recordedAt,
        ).schedule,
      );
    }
  }
  return schedules;
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
              .filter((allocation: MarkAllocation) => allocation.targetConceptIds.length === 1)
              .flatMap((allocation) => allocation.targetConceptIds),
          ),
        ),
      ],
    })),
  );
}

function withinConceptScope(
  question: QuestionSetQuestion,
  ids: ReadonlySet<string> | undefined,
): boolean {
  return (
    !ids ||
    answers(question).every(({ answer }) =>
      answer.allocations.every((allocation) =>
        [...allocation.targetConceptIds, ...answer.prerequisiteConceptIds].every((id) =>
          ids.has(id),
        ),
      ),
    )
  );
}

export interface ConceptPracticeItem {
  conceptId: string;
  name: string;
  schedule: QuestionScheduleState;
  due: boolean;
  unseenCount: number;
  familiarCount: number;
  availableCount: number;
  needs?: ConceptPracticeNeeds;
  diagnosticEvidence?: readonly DiagnosticCategoryEvidence[];
  techniqueIds?: TechniqueId[];
  unfinished?: boolean;
}

function familyKey(set: QuestionSetRecord, questionId: string): string {
  const family = set.bank?.family;
  return family
    ? `${set.bank!.bankId}:${family.id}:${familyPresentationRevision(family, questionId)}:${questionId}`
    : `${set.id}:${questionId}`;
}

async function context(courseId: string) {
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
    needs: deriveConceptPracticeNeeds(records, currentSets),
    attempts: records,
    seen,
    schedules: deriveConceptApplicationSchedules(records),
  };
}

function unseenCapacity(candidate: Candidate, data: Awaited<ReturnType<typeof context>>): number {
  if (!candidate.set.bank?.family) return data.seen.has(candidate.fingerprint) ? 0 : 1;
  return Math.max(
    0,
    candidate.capacity -
      (data.seenVariants.get(familyKey(candidate.set, candidate.question.id))?.size ?? 0),
  );
}

function unfinishedPractice(
  data: Awaited<ReturnType<typeof context>>,
  conceptId: string | undefined,
  scope: ReadonlySet<string> | undefined,
) {
  return data.attempts
    .filter(
      (attempt) =>
        attempt.conceptPractice &&
        attempt.status !== 'complete' &&
        attempt.undoneAt === undefined &&
        (!conceptId || attempt.conceptPractice.conceptId === conceptId) &&
        (!scope || scope.has(attempt.conceptPractice.conceptId)) &&
        attempt.receipt.questions.every((question) => withinConceptScope(question, scope)) &&
        data.candidates.some((candidate) => candidate.set.id === attempt.questionSetId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

export async function listConceptPractice(
  courseId: string,
  now = Date.now(),
  scopeConceptIds?: readonly string[],
): Promise<ConceptPracticeItem[]> {
  const data = await context(courseId);
  const diagnosticEvidence = deriveConceptDiagnosticEvidence(data.attempts, data.sets);
  const scope = scopeConceptIds ? new Set(scopeConceptIds) : undefined;
  return data.concepts
    .filter((concept) => !scope || scope.has(concept.id))
    .map((concept) => {
      const schedule = data.schedules.get(concept.id) ?? emptyQuestionSchedule();
      const available = data.candidates.filter(
        (row) => row.conceptIds.includes(concept.id) && withinConceptScope(row.question, scope),
      );
      const unseenCount = available.reduce((total, row) => total + unseenCapacity(row, data), 0);
      const availableCount = available.reduce((total, row) => total + row.capacity, 0);
      return {
        conceptId: concept.id,
        name: concept.name,
        schedule,
        due:
          schedule.due === null ||
          schedule.due <= now ||
          Boolean(
            data.needs.get(concept.id)?.knowledge ||
            data.needs.get(concept.id)?.application ||
            data.needs.get(concept.id)?.techniques.length,
          ),
        unseenCount,
        familiarCount: availableCount - unseenCount,
        availableCount,
        needs: data.needs.get(concept.id),
        diagnosticEvidence: diagnosticEvidence.get(concept.id),
        techniqueIds: [
          ...new Set(
            available.flatMap(({ question }) =>
              answers(question).flatMap(({ answer }) =>
                answer.allocations.flatMap((allocation) =>
                  allocation.targetConceptIds.includes(concept.id)
                    ? (allocation.techniqueTags?.techniqueIds ?? [])
                    : [],
                ),
              ),
            ),
          ),
        ],
        unfinished: Boolean(unfinishedPractice(data, concept.id, scope)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.due) - Number(a.due) ||
        (a.schedule.due ?? 0) - (b.schedule.due ?? 0) ||
        a.conceptId.localeCompare(b.conceptId),
    );
}

export class ConceptPracticeExhaustedError extends Error {
  constructor(public readonly reason: 'no-due-concepts' | 'no-unseen-questions' | 'no-questions') {
    super(
      reason === 'no-unseen-questions'
        ? 'No unseen questions remain. Choose familiar practice explicitly.'
        : reason === 'no-due-concepts'
          ? 'No Concepts are due.'
          : 'No questions are available for this Concept.',
    );
    this.name = 'ConceptPracticeExhaustedError';
  }
}

export async function startConceptPractice(
  courseId: string,
  conceptId?: string,
  options: {
    allowFamiliar?: boolean;
    now?: number;
    mode?: 'due' | 'mixed';
    scopeConceptIds?: readonly string[];
    resume?: boolean;
    blueprint?: Partial<{ type: string; difficulty: string; context: string }>;
  } = {},
): Promise<{ attempt: QuestionSetAttemptRecord; selection: ConceptPracticeSelection }> {
  const now = options.now ?? Date.now();
  return db.transaction(
    'rw',
    [db.courses, db.concepts, db.questionSets, db.questionSetAttempts],
    async () => {
      const data = await context(courseId);
      const course = await db.courses.get(courseId);
      if (!course || course.archived) throw new Error('This course is unavailable for practice.');
      const scope = options.scopeConceptIds ? new Set(options.scopeConceptIds) : undefined;
      if (options.resume) {
        const unfinished = unfinishedPractice(data, conceptId, scope);
        if (unfinished) return { attempt: unfinished, selection: unfinished.conceptPractice! };
      }
      const due = data.concepts.filter((concept) => {
        const schedule = data.schedules.get(concept.id);
        const needs = data.needs.get(concept.id);
        return (
          !schedule ||
          schedule.due === null ||
          schedule.due <= now ||
          Boolean(needs?.knowledge || needs?.application || needs?.techniques.length)
        );
      });
      const eligible = (
        conceptId
          ? data.concepts.filter((concept) => concept.id === conceptId)
          : options.mode === 'mixed'
            ? data.concepts
            : due
      ).filter((concept) => !scope || scope.has(concept.id));
      if (!eligible.length) throw new ConceptPracticeExhaustedError('no-due-concepts');
      const ids = new Set(eligible.map((concept) => concept.id));
      const available = data.candidates.filter(
        (candidate) =>
          candidate.conceptIds.some((id) => ids.has(id)) &&
          withinConceptScope(candidate.question, scope) &&
          Object.entries(options.blueprint ?? {}).every(
            ([key, value]) =>
              candidate.set.bank?.blueprint[key as 'type' | 'difficulty' | 'context'] === value,
          ),
      );
      if (!available.length) throw new ConceptPracticeExhaustedError('no-questions');
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
      const pool = available.filter(
        (candidate) => options.allowFamiliar || unseenCapacity(candidate, data) > 0,
      );
      if (!pool.length) throw new ConceptPracticeExhaustedError('no-unseen-questions');
      pool.sort(
        (a, b) =>
          Number(unseenCapacity(a, data) === 0) - Number(unseenCapacity(b, data) === 0) ||
          questionGapPriority(b.question, data.needs) -
            questionGapPriority(a.question, data.needs) ||
          (options.mode === 'mixed'
            ? (cellExposures.get(cellKey(a.set)) ?? 0) - (cellExposures.get(cellKey(b.set)) ?? 0)
            : 0) ||
          Number(recent.has(a.sibling)) - Number(recent.has(b.sibling)) ||
          Math.min(
            ...a.conceptIds
              .filter((id) => ids.has(id))
              .map((id) => data.schedules.get(id)?.due ?? 0),
          ) -
            Math.min(
              ...b.conceptIds
                .filter((id) => ids.has(id))
                .map((id) => data.schedules.get(id)?.due ?? 0),
            ) ||
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
      if (!selected) throw new ConceptPracticeExhaustedError('no-unseen-questions');
      const selection: ConceptPracticeSelection = {
        conceptId: conceptId ?? selected.candidate.conceptIds.filter((id) => ids.has(id)).sort()[0],
        questionSetId: selected.set.id,
        questionId: selected.question.id,
        novelty: data.seen.has(selected.fingerprint) ? 'familiar' : 'unseen',
        fingerprint: selected.fingerprint,
      };
      const attempt = await startQuestionSetAttempt(
        selected.set.id,
        'practice',
        now,
        selection,
        selected.index,
      );
      return { attempt, selection };
    },
  );
}
