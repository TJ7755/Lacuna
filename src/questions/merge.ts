import type { CourseRecord, Tombstone } from '../db/types';
import { replayQuestionSchedule } from './scheduler';
import type { Concept, QuestionAttempt, QuestionConceptSet, QuestionDefinition } from './types';

export interface QuestionMergeCollections {
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
}

interface AuthoredBundle {
  question: QuestionDefinition;
  concepts: QuestionConceptSet;
}

const SCHEDULE_KEYS = new Set([
  'stability',
  'difficulty',
  'lastReviewed',
  'reps',
  'lapses',
  'state',
  'due',
  'scheduledDays',
  'learningSteps',
  'scheduleUpdatedAt',
  'updatedAt',
]);

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .flatMap((key) => (record[key] === undefined ? [] : [[key, sortKeys(record[key])]])),
  );
}

function authoredQuestion(question: QuestionDefinition): Record<string, unknown> {
  return Object.fromEntries(Object.entries(question).filter(([key]) => !SCHEDULE_KEYS.has(key)));
}

function bundleIdentity(bundle: AuthoredBundle): string {
  return canonicalJson({
    question: authoredQuestion(bundle.question),
    concepts: bundle.concepts,
  });
}

function bundlesFor(collections: QuestionMergeCollections): Map<string, AuthoredBundle> {
  const links = new Map(collections.questionConcepts.map((set) => [set.questionId, set]));
  const bundles = new Map<string, AuthoredBundle>();
  for (const question of collections.questions) {
    const concepts = links.get(question.id);
    if (!concepts) {
      throw new Error(`Question ${question.id} has no authored Concept relationship set.`);
    }
    if (
      concepts.authoringRevisionId !== question.authoringRevisionId ||
      concepts.courseId !== question.courseId
    ) {
      throw new Error(`Question ${question.id} has an incoherent authored bundle.`);
    }
    bundles.set(question.id, { question, concepts });
  }
  for (const set of collections.questionConcepts) {
    if (!bundles.has(set.questionId)) {
      throw new Error(`Question Concept relationship set ${set.questionId} is orphaned.`);
    }
  }
  return bundles;
}

function newerBundle(left: AuthoredBundle, right: AuthoredBundle): AuthoredBundle {
  if (left.question.authoringRevisionId === right.question.authoringRevisionId) {
    if (bundleIdentity(left) !== bundleIdentity(right)) {
      throw new Error(
        `Question ${left.question.id} has conflicting content for one authoring revision.`,
      );
    }
    return canonicalJson(left) >= canonicalJson(right) ? left : right;
  }
  if (left.question.authoringUpdatedAt !== right.question.authoringUpdatedAt) {
    return left.question.authoringUpdatedAt > right.question.authoringUpdatedAt ? left : right;
  }
  return bundleIdentity(left) >= bundleIdentity(right) ? left : right;
}

function newestById<T extends { id: string; updatedAt: number }>(left: T[], right: T[]): T[] {
  const rows = new Map<string, T>();
  for (const row of [...left, ...right]) {
    const existing = rows.get(row.id);
    if (
      !existing ||
      row.updatedAt > existing.updatedAt ||
      (row.updatedAt === existing.updatedAt && canonicalJson(row) > canonicalJson(existing))
    ) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}

function tombstoneMap(rows: readonly Tombstone[]): Map<string, Tombstone> {
  const result = new Map<string, Tombstone>();
  for (const row of rows) {
    const key = `${row.table}:${row.recordId}`;
    const existing = result.get(key);
    if (!existing || row.deletedAt > existing.deletedAt) result.set(key, row);
  }
  return result;
}

const RECEIPT_RESULT_KEYS = new Set([
  'answeredAt',
  'abandonedAt',
  'undoneAt',
  'updatedAt',
  'status',
  'submittedAnswer',
  'marksEarned',
  'marksAvailable',
  'lineVerdicts',
  'checkerDisputes',
  'correction',
  'responseTimeSeconds',
  'grade',
  'retrievabilityAtAttempt',
  'scheduleEffect',
  'schedulerVersion',
  'gradeMappingVersion',
  'schedulerConfigFingerprint',
  'schedulerConfig',
]);

function receiptIdentity(attempt: QuestionAttempt): string {
  return canonicalJson(
    Object.fromEntries(Object.entries(attempt).filter(([key]) => !RECEIPT_RESULT_KEYS.has(key))),
  );
}

const RESULT_LIFECYCLE_KEYS = new Set(['updatedAt', 'undoneAt', 'correction']);

function answeredResultIdentity(attempt: QuestionAttempt): string {
  const receipt = JSON.parse(receiptIdentity(attempt)) as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(attempt).filter(
      ([key]) =>
        RECEIPT_RESULT_KEYS.has(key) && !RESULT_LIFECYCLE_KEYS.has(key) && key !== 'abandonedAt',
    ),
  );
  return canonicalJson({ receipt, result });
}

function statusRank(status: QuestionAttempt['status']): number {
  if (status === 'answered') return 2;
  if (status === 'abandoned') return 1;
  return 0;
}

function laterCorrection(
  left: QuestionAttempt['correction'],
  right: QuestionAttempt['correction'],
): QuestionAttempt['correction'] {
  if (!left) return right;
  if (!right) return left;
  if (left.submittedAt !== right.submittedAt) {
    return left.submittedAt > right.submittedAt ? left : right;
  }
  return canonicalJson(left) >= canonicalJson(right) ? left : right;
}

export function mergeQuestionAttempt(
  left: QuestionAttempt,
  right: QuestionAttempt,
): QuestionAttempt {
  if (receiptIdentity(left) !== receiptIdentity(right)) {
    throw new Error(`Attempt ${left.id} has a conflicting immutable Question attempt receipt.`);
  }
  if (
    left.status === 'answered' &&
    right.status === 'answered' &&
    answeredResultIdentity(left) !== answeredResultIdentity(right)
  ) {
    throw new Error(`Attempt ${left.id} has conflicting immutable first-submission evidence.`);
  }
  let winner: QuestionAttempt;
  const leftRank = statusRank(left.status);
  const rightRank = statusRank(right.status);
  if (leftRank !== rightRank) winner = leftRank > rightRank ? left : right;
  else if (left.updatedAt !== right.updatedAt)
    winner = left.updatedAt > right.updatedAt ? left : right;
  else winner = canonicalJson(left) >= canonicalJson(right) ? left : right;

  const undoneAt = Math.max(left.undoneAt ?? -Infinity, right.undoneAt ?? -Infinity);
  const correction = laterCorrection(left.correction, right.correction);
  return {
    ...winner,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    ...(Number.isFinite(undoneAt) ? { undoneAt } : {}),
    ...(correction ? { correction } : {}),
  };
}

function mergeAttempts(left: QuestionAttempt[], right: QuestionAttempt[]): QuestionAttempt[] {
  const attempts = new Map<string, QuestionAttempt>();
  for (const attempt of [...left, ...right]) {
    const existing = attempts.get(attempt.id);
    attempts.set(attempt.id, existing ? mergeQuestionAttempt(existing, attempt) : attempt);
  }
  return [...attempts.values()];
}

function scheduleTimestamp(
  question: QuestionDefinition,
  attempts: readonly QuestionAttempt[],
): number {
  const baselineReviewedAt =
    question.scheduleEpoch.baseline.kind === 'legacy-opaque'
      ? (question.scheduleEpoch.baseline.state.lastReviewed ?? 0)
      : 0;
  return Math.max(
    question.scheduleEpoch.startedAt,
    baselineReviewedAt,
    ...attempts.flatMap((attempt) =>
      attempt.scheduleEpochId === question.scheduleEpoch.id &&
      attempt.status === 'answered' &&
      attempt.undoneAt === undefined &&
      attempt.scheduleEffect.kind === 'replay' &&
      attempt.answeredAt !== undefined
        ? [attempt.answeredAt]
        : [],
    ),
  );
}

export function mergeQuestionCollections(
  left: QuestionMergeCollections,
  right: QuestionMergeCollections,
  courses: readonly CourseRecord[],
  tombstones: readonly Tombstone[],
): QuestionMergeCollections {
  const tombstoneByKey = tombstoneMap(tombstones);
  const liveCourseIds = new Set(courses.map((course) => course.id));
  const concepts = newestById(left.concepts, right.concepts)
    .filter((concept) => concept.courseId === null || liveCourseIds.has(concept.courseId))
    .filter((concept) => {
      const deleted = tombstoneByKey.get(`concepts:${concept.id}`);
      return !deleted || concept.updatedAt > deleted.deletedAt;
    });

  const leftBundles = bundlesFor(left);
  const rightBundles = bundlesFor(right);
  const bundleIds = new Set([...leftBundles.keys(), ...rightBundles.keys()]);
  const bundles: AuthoredBundle[] = [];
  for (const id of bundleIds) {
    const a = leftBundles.get(id);
    const b = rightBundles.get(id);
    const bundle = a && b ? newerBundle(a, b) : (a ?? b)!;
    const questionTombstone = tombstoneByKey.get(`questions:${id}`);
    const linkTombstone = tombstoneByKey.get(`questionConcepts:${id}`);
    if (!liveCourseIds.has(bundle.question.courseId)) continue;
    if (questionTombstone && bundle.question.authoringUpdatedAt <= questionTombstone.deletedAt) {
      continue;
    }
    if (linkTombstone && bundle.concepts.authoringUpdatedAt <= linkTombstone.deletedAt) continue;
    bundles.push(bundle);
  }
  const liveConceptIds = new Set(concepts.map((concept) => concept.id));
  for (const bundle of bundles) {
    const referenced = [
      ...bundle.concepts.targetConceptIds,
      ...bundle.concepts.prerequisiteConceptIds,
    ];
    if (referenced.some((conceptId) => !liveConceptIds.has(conceptId))) {
      throw new Error(`Question ${bundle.question.id} references a deleted Concept.`);
    }
  }

  const questionAttempts = mergeAttempts(left.questionAttempts, right.questionAttempts)
    .filter((attempt) => liveCourseIds.has(attempt.courseId))
    .filter((attempt) => {
      const deleted = tombstoneByKey.get(`questionAttempts:${attempt.id}`);
      return !deleted || attempt.updatedAt > deleted.deletedAt;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const questions = bundles.map(({ question }) => {
    const course = courseById.get(question.courseId);
    if (!course) throw new Error(`Question ${question.id} belongs to a missing Course.`);
    const attempts = questionAttempts.filter((attempt) => attempt.questionId === question.id);
    const schedule = replayQuestionSchedule(question, attempts, course.fsrsParameters);
    const scheduleUpdatedAt = scheduleTimestamp(question, attempts);
    return {
      ...question,
      ...schedule,
      scheduleUpdatedAt,
      updatedAt: Math.max(question.authoringUpdatedAt, scheduleUpdatedAt),
    };
  });

  return {
    concepts: concepts.sort((a, b) => a.id.localeCompare(b.id)),
    questions: questions.sort((a, b) => a.id.localeCompare(b.id)),
    questionConcepts: bundles
      .map((bundle) => bundle.concepts)
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    questionAttempts,
  };
}
