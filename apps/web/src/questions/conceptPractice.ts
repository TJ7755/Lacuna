import {
  answers,
  practiceContext,
  unseenCapacity,
  selectPracticeQuestion,
  QuestionPracticeExhaustedError,
} from './questionPracticeSelection';
import { db } from '../db/schema';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  type ConceptPracticeSelection,
  type QuestionSetAttemptRecord,
} from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetQuestion } from '@lacuna/core/questions/questionSets';
import { emptyQuestionSchedule, scheduleQuestionReview } from './scheduler';
import type { QuestionScheduleState } from '@lacuna/core/questions/types';
import {
  deriveConceptDiagnosticEvidence,
  deriveConceptPracticeNeeds,
  questionGapPriority,
  type ConceptPracticeNeeds,
  type DiagnosticCategoryEvidence,
} from './techniqueEvidence';
import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';

export { undoConceptPracticeAttempt } from './questionSetAttemptRepository';
export { questionPresentationFingerprint as conceptPracticeFingerprint } from './generators/declarative';

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
        if (allocation.dimension === 'knowledge') continue;
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

async function context(courseId: string) {
  const data = await practiceContext(courseId);
  return {
    ...data,
    needs: deriveConceptPracticeNeeds(data.attempts, data.sets),
    schedules: deriveConceptApplicationSchedules(data.attempts),
  };
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
                  allocation.dimension !== 'knowledge' &&
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
      let selected;
      try {
        selected = selectPracticeQuestion(
          data,
          available,
          { ...options, mode: options.mode ?? 'due' },
          (a, b) =>
            questionGapPriority(b.question, data.needs) -
            questionGapPriority(a.question, data.needs),
          (a, b) =>
            Math.min(
              ...a.conceptIds
                .filter((id) => ids.has(id))
                .map((id) => data.schedules.get(id)?.due ?? 0),
            ) -
            Math.min(
              ...b.conceptIds
                .filter((id) => ids.has(id))
                .map((id) => data.schedules.get(id)?.due ?? 0),
            ),
        );
      } catch (cause) {
        if (cause instanceof QuestionPracticeExhaustedError)
          throw new ConceptPracticeExhaustedError(cause.reason);
        throw cause;
      }
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
