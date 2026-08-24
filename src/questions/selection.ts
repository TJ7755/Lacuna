import type { QuestionAttempt, QuestionConceptSet, QuestionDefinition } from './types';

export interface QuestionSelectionOptions {
  now?: number;
  mode?: 'default' | 'all-due';
  /** Defaults to ten and is ignored by All due. */
  limit?: number;
}

interface RankedQuestion {
  question: QuestionDefinition;
  targetConceptId: string;
  exposureCount: number;
  lastShownAt: number | null;
}

export interface QuestionExposureSummary {
  exposureCount: number;
  lastShownAt: number | null;
}

export function questionExposureSummaries(
  attempts: readonly QuestionAttempt[],
): ReadonlyMap<string, QuestionExposureSummary> {
  const summaries = new Map<string, QuestionExposureSummary>();
  for (const attempt of attempts) {
    const previous = summaries.get(attempt.questionId);
    summaries.set(attempt.questionId, {
      exposureCount: (previous?.exposureCount ?? 0) + 1,
      lastShownAt: Math.max(previous?.lastShownAt ?? Number.NEGATIVE_INFINITY, attempt.shownAt),
    });
  }
  return summaries;
}

function interleaveByTarget(
  ranked: RankedQuestion[],
  previousTarget: string | null,
): RankedQuestion[] {
  const remaining = [...ranked];
  const result: RankedQuestion[] = [];
  let lastTarget = previousTarget;

  while (remaining.length > 0) {
    const alternativeIndex =
      lastTarget === null ? 0 : remaining.findIndex((item) => item.targetConceptId !== lastTarget);
    const index = alternativeIndex < 0 ? 0 : alternativeIndex;
    const [next] = remaining.splice(index, 1);
    result.push(next);
    lastTarget = next.targetConceptId;
  }

  return result;
}

/** Build a deterministic Question session without consulting any Card pool. */
export function selectQuestionSession(
  questions: readonly QuestionDefinition[],
  conceptSets: readonly QuestionConceptSet[],
  attempts: readonly QuestionAttempt[],
  options: QuestionSelectionOptions = {},
): QuestionDefinition[] {
  const now = options.now ?? Date.now();
  const mode = options.mode ?? 'default';
  const requestedLimit = options.limit ?? 10;
  const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.floor(requestedLimit)) : 10;
  const setsByQuestion = new Map<string, QuestionConceptSet>();
  for (const set of conceptSets) {
    if (setsByQuestion.has(set.questionId)) {
      throw new Error(`Question ${set.questionId} has more than one concept relationship set.`);
    }
    setsByQuestion.set(set.questionId, set);
  }
  const exposures = questionExposureSummaries(attempts);

  const ranked = questions
    .filter((question) => !question.suspended)
    .map((question): RankedQuestion => {
      const set = setsByQuestion.get(question.id);
      if (!set) throw new Error(`Question ${question.id} has no target concept relationship.`);
      if (set.courseId !== question.courseId) {
        throw new Error(
          `Question ${question.id} has a target concept relationship in another Course.`,
        );
      }
      if (set.targetConceptIds.length !== 1) {
        throw new Error(`Question ${question.id} must have exactly one target concept.`);
      }
      const exposure = exposures.get(question.id);
      return {
        question,
        targetConceptId: set.targetConceptIds[0],
        exposureCount: exposure?.exposureCount ?? 0,
        lastShownAt: exposure?.lastShownAt ?? null,
      };
    });

  const due = ranked
    .filter((item) => item.question.due !== null && item.question.due <= now)
    .sort((left, right) => {
      const urgency = (left.question.due as number) - (right.question.due as number);
      if (urgency !== 0) return urgency;
      if (left.exposureCount !== right.exposureCount) {
        return left.exposureCount - right.exposureCount;
      }
      const leftShownAt = left.lastShownAt ?? Number.NEGATIVE_INFINITY;
      const rightShownAt = right.lastShownAt ?? Number.NEGATIVE_INFINITY;
      return leftShownAt - rightShownAt || left.question.id.localeCompare(right.question.id);
    });
  const interleavedDue = interleaveByTarget(due, null);
  if (mode === 'all-due') return interleavedDue.map((item) => item.question);
  if (limit === 0) return [];

  const dueIds = new Set(due.map((item) => item.question.id));
  const unseen = ranked
    .filter((item) => item.exposureCount === 0 && !dueIds.has(item.question.id))
    .sort((left, right) => {
      if (left.question.kind !== right.question.kind)
        return left.question.kind === 'fixed' ? -1 : 1;
      return left.question.id.localeCompare(right.question.id);
    });
  const previousTarget = interleavedDue.at(-1)?.targetConceptId ?? null;
  const selected = [...interleavedDue, ...interleaveByTarget(unseen, previousTarget)].slice(
    0,
    limit,
  );

  return selected.map((item) => item.question);
}
