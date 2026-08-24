import type { QuestionAttempt, QuestionDefinition } from './types';

export interface QuestionPerformanceMetric {
  attemptCount: number;
  fullCreditCount: number;
  marksEarned: number;
  marksAvailable: number;
  /** Full-credit attempts divided by scored attempts. Null when there is no evidence. */
  accuracy: number | null;
  /** Marks earned divided by marks available. Null when there is no evidence. */
  markRate: number | null;
}

export interface QuestionCriterionPerformance {
  id: string;
  questionId: string;
  contentVersion: number;
  lineIndex: number;
  label: string;
  opportunityCount: number;
  fullCreditCount: number;
  marksEarned: number;
  marksAvailable: number;
  accuracy: number;
  markRate: number;
}

export interface QuestionAnalytics {
  inventory: {
    total: number;
    due: number;
    unseen: number;
    suspended: number;
  };
  fixed: {
    definitionCount: number;
    presentedDefinitionCount: number;
    exposureCoverage: number | null;
    firstPresentation: QuestionPerformanceMetric;
    repeat: QuestionPerformanceMetric;
  };
  generated: {
    definitionCount: number;
    presentationCount: number;
    uniqueVariantCount: number;
    repeatedPresentationCount: number;
    repeatRate: number | null;
    novel: QuestionPerformanceMetric;
    repeated: QuestionPerformanceMetric;
  };
  criteria: QuestionCriterionPerformance[];
  checkerDisputeCount: number;
  excluded: {
    shown: number;
    abandoned: number;
    undone: number;
    checkerWithheld: number;
    unscored: number;
  };
}

interface MetricAccumulator {
  attemptCount: number;
  fullCreditCount: number;
  marksEarned: number;
  marksAvailable: number;
}

interface CriterionAccumulator {
  questionId: string;
  contentVersion: number;
  lineIndex: number;
  label: string;
  opportunityCount: number;
  fullCreditCount: number;
  marksEarned: number;
  marksAvailable: number;
}

type PresentationClass = 'fixed-first' | 'fixed-repeat' | 'generated-novel' | 'generated-repeat';

function emptyMetric(): MetricAccumulator {
  return { attemptCount: 0, fullCreditCount: 0, marksEarned: 0, marksAvailable: 0 };
}

function finishMetric(metric: MetricAccumulator): QuestionPerformanceMetric {
  return {
    ...metric,
    accuracy: metric.attemptCount ? metric.fullCreditCount / metric.attemptCount : null,
    markRate: metric.marksAvailable ? metric.marksEarned / metric.marksAvailable : null,
  };
}

function addAttempt(metric: MetricAccumulator, attempt: QuestionAttempt): void {
  const marksEarned = attempt.marksEarned as number;
  const marksAvailable = attempt.marksAvailable as number;
  metric.attemptCount += 1;
  metric.fullCreditCount += marksEarned === marksAvailable ? 1 : 0;
  metric.marksEarned += marksEarned;
  metric.marksAvailable += marksAvailable;
}

function marksAreScorable(attempt: QuestionAttempt): boolean {
  return (
    Number.isSafeInteger(attempt.marksEarned) &&
    Number.isSafeInteger(attempt.marksAvailable) &&
    (attempt.marksAvailable as number) > 0 &&
    (attempt.marksEarned as number) >= 0 &&
    (attempt.marksEarned as number) <= (attempt.marksAvailable as number)
  );
}

function checkerWithheld(attempt: QuestionAttempt): boolean {
  return (
    attempt.grade === undefined ||
    (attempt.checkerDisputes?.length ?? 0) > 0 ||
    (attempt.lineVerdicts?.some((line) => line.undetermined) ?? false)
  );
}

/**
 * Question evidence is analysed independently from Card history. Presentation history
 * decides familiarity; only active, graded, machine-scored first submissions decide
 * accuracy. Corrections deliberately do not rewrite either measure.
 */
export function buildQuestionAnalytics(
  questions: readonly QuestionDefinition[],
  attempts: readonly QuestionAttempt[],
  now = Date.now(),
): QuestionAnalytics {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const presentedQuestionIds = new Set(attempts.map((attempt) => attempt.questionId));
  const fixedDefinitionIds = new Set(
    questions.filter((question) => question.kind === 'fixed').map((question) => question.id),
  );
  const presentationClass = new Map<string, PresentationClass>();
  const fixedSeen = new Set<string>();
  const generatedFingerprints = new Set<string>();
  let generatedPresentationCount = 0;
  let repeatedGeneratedPresentations = 0;

  const orderedAttempts = [...attempts].sort(
    (left, right) => left.shownAt - right.shownAt || left.id.localeCompare(right.id),
  );
  for (const attempt of orderedAttempts) {
    const generated =
      questionById.get(attempt.questionId)?.kind === 'generated' ||
      attempt.generatorKey !== undefined;
    if (!generated) {
      const repeated = fixedSeen.has(attempt.questionId);
      presentationClass.set(attempt.id, repeated ? 'fixed-repeat' : 'fixed-first');
      fixedSeen.add(attempt.questionId);
      continue;
    }

    generatedPresentationCount += 1;
    const fingerprint = attempt.generatorFingerprint;
    if (!fingerprint) continue;
    const repeated = generatedFingerprints.has(fingerprint);
    presentationClass.set(attempt.id, repeated ? 'generated-repeat' : 'generated-novel');
    if (repeated) repeatedGeneratedPresentations += 1;
    generatedFingerprints.add(fingerprint);
  }

  const fixedFirst = emptyMetric();
  const fixedRepeat = emptyMetric();
  const generatedNovel = emptyMetric();
  const generatedRepeated = emptyMetric();
  const criterionById = new Map<string, CriterionAccumulator>();
  const excluded = { shown: 0, abandoned: 0, undone: 0, checkerWithheld: 0, unscored: 0 };
  let checkerDisputeCount = 0;

  for (const attempt of orderedAttempts) {
    checkerDisputeCount += attempt.checkerDisputes?.length ?? 0;
    if (attempt.status === 'shown') {
      excluded.shown += 1;
      continue;
    }
    if (attempt.status === 'abandoned') {
      excluded.abandoned += 1;
      continue;
    }
    if (attempt.undoneAt !== undefined) {
      excluded.undone += 1;
      continue;
    }
    if (checkerWithheld(attempt)) {
      excluded.checkerWithheld += 1;
      continue;
    }
    if (!marksAreScorable(attempt)) {
      excluded.unscored += 1;
      continue;
    }

    const classification = presentationClass.get(attempt.id);
    if (classification === 'fixed-first') addAttempt(fixedFirst, attempt);
    else if (classification === 'fixed-repeat') addAttempt(fixedRepeat, attempt);
    else if (classification === 'generated-novel') addAttempt(generatedNovel, attempt);
    else if (classification === 'generated-repeat') addAttempt(generatedRepeated, attempt);

    collectCriteria(attempt, criterionById);
  }

  const fixedDefinitionCount = fixedDefinitionIds.size;
  const presentedFixedDefinitions = [...fixedDefinitionIds].filter((id) =>
    presentedQuestionIds.has(id),
  ).length;
  const criteria = [...criterionById.entries()]
    .map(
      ([id, criterion]): QuestionCriterionPerformance => ({
        id,
        ...criterion,
        accuracy: criterion.fullCreditCount / criterion.opportunityCount,
        markRate: criterion.marksEarned / criterion.marksAvailable,
      }),
    )
    .sort(
      (left, right) =>
        left.questionId.localeCompare(right.questionId) ||
        left.contentVersion - right.contentVersion ||
        left.lineIndex - right.lineIndex ||
        left.label.localeCompare(right.label),
    );

  return {
    inventory: {
      total: questions.length,
      due: questions.filter(
        (question) => !question.suspended && question.due !== null && question.due <= now,
      ).length,
      unseen: questions.filter((question) => !presentedQuestionIds.has(question.id)).length,
      suspended: questions.filter((question) => question.suspended).length,
    },
    fixed: {
      definitionCount: fixedDefinitionCount,
      presentedDefinitionCount: presentedFixedDefinitions,
      exposureCoverage: fixedDefinitionCount
        ? presentedFixedDefinitions / fixedDefinitionCount
        : null,
      firstPresentation: finishMetric(fixedFirst),
      repeat: finishMetric(fixedRepeat),
    },
    generated: {
      definitionCount: questions.filter((question) => question.kind === 'generated').length,
      presentationCount: generatedPresentationCount,
      uniqueVariantCount: generatedFingerprints.size,
      repeatedPresentationCount: repeatedGeneratedPresentations,
      repeatRate: generatedPresentationCount
        ? repeatedGeneratedPresentations / generatedPresentationCount
        : null,
      novel: finishMetric(generatedNovel),
      repeated: finishMetric(generatedRepeated),
    },
    criteria,
    checkerDisputeCount,
    excluded,
  };
}

function collectCriteria(
  attempt: QuestionAttempt,
  criterionById: Map<string, CriterionAccumulator>,
): void {
  if (attempt.resolvedPayload.kind !== 'working' || attempt.lineVerdicts === undefined) return;
  const lineVerdicts = attempt.lineVerdicts;
  attempt.resolvedPayload.scheme.forEach((line, lineIndex) => {
    const label = line.label?.trim() || `Criterion ${lineIndex + 1}`;
    const id = `${attempt.questionId}:v${attempt.contentVersion}:criterion:${lineIndex}:${label}`;
    const existing = criterionById.get(id) ?? {
      questionId: attempt.questionId,
      contentVersion: attempt.contentVersion,
      lineIndex,
      label,
      opportunityCount: 0,
      fullCreditCount: 0,
      marksEarned: 0,
      marksAvailable: 0,
    };
    const marksEarned = lineVerdicts
      .filter((verdict) => verdict.matchedLineIndex === lineIndex)
      .reduce((total, verdict) => total + verdict.marksEarned, 0);
    const cappedMarks = Math.min(line.marks, marksEarned);
    existing.opportunityCount += 1;
    existing.fullCreditCount += cappedMarks === line.marks ? 1 : 0;
    existing.marksEarned += cappedMarks;
    existing.marksAvailable += line.marks;
    criterionById.set(id, existing);
  });
}
