import { buildQuestionAnalytics } from '../questions/analytics';
import type { QuestionCriterionPerformance } from '../questions/analytics';
import type { QuestionAttempt, QuestionDefinition } from '@lacuna/core/questions/types';

/**
 * Wire schema for one device's anonymous weekly study summary (issue #589).
 *
 * The summariser is the only place local study evidence enters the relay's field of
 * view, so it emits nothing but counted aggregates: no Attempt records, no card text,
 * no answers, no timings finer than the ISO week, and no device or user identifiers.
 * Cells are keyed by the lineage ids that every copy of the published course shares
 * (established by the Phase 0 contract tests), so a teacher can aggregate copies
 * without a local id-mapping layer.
 *
 * The keys follow the compact `SharePayloadV3` wire convention, and `v` carries the
 * schema version, so the relay (#590) and the teacher's merge (#592) can reject
 * unfamiliar versions instead of guessing. Cells carry only what the privacy module
 * (#588) needs as its numerator and denominator, and the summary is capped at the
 * 8 KB budget with room to spare for a year's course content.
 *
 * Scope note (owner decision, 2026-10-18): with the end-to-end pivot (plan in
 * #600) these aggregates become the *keyless signalling path* — participation and
 * cohort-size data only — while a sibling per-pupil envelope path, encrypted to the
 * course owner's key, will carry the raw per-question evidence that the teacher's
 * device decrypts. */

export const INSIGHTS_SCHEMA_VERSION = 1 as const;

/** One aggregate cell keyed by a lineage identity shared across all course copies. */
interface InsightsCell {
  /** The shared Concept id, or `questionId:vN:criterion:lineIndex` for a mark-scheme criterion. */
  i: string;
  /** Numerator: retained card reviews, or marks earned across the scored attempts. */
  n: number;
  /** Denominator: completed card reviews, or marks available across those attempts. */
  d: number;
}

/**
 * One device's summary for one published course and one ISO week. Compact keys:
 * `v` schemaVersion, `s` shareId, `w` isoWeek label, `a` activeThisWeek,
 * `co` per-Concept card cells, `cr` per-criterion question cells.
 */
export interface InsightSummary {
  v: typeof INSIGHTS_SCHEMA_VERSION;
  s: string;
  w: string;
  a: boolean;
  co: InsightsCell[];
  cr: InsightsCell[];
}

/** One card review reduced to the retention signal the summary reports. */
export interface InsightsReview {
  /** The Concept id of the reviewed Card: a lineage id shared by every class copy. */
  conceptId: string;
  /** Whether the review kept the card's knowledge, as the caller records it. */
  retained: boolean;
}

/**
 * Evidence already filtered by the caller to the target ISO week and target course.
 * The summariser never reads the database, so filtering is the caller's job; this
 * keeps the function total, pure and cheap to test on synthetic evidence.
 */
export interface InsightsEvidence {
  /** Completed card reviews of the target ISO week and course. */
  reviews: ReadonlyArray<InsightsReview>;
  /** Question attempts recorded in the target ISO week and course. */
  attempts: readonly QuestionAttempt[];
  /** Question definitions of the target course, for criteria classification. */
  questions: readonly QuestionDefinition[];
}

export interface SummariseForInsightsOptions {
  /** ISO 8601 week label of the target week, e.g. `2026-W07`. */
  week: string;
  /**
   * Share link id of the published lineage, resolved by the caller from the share
   * link store or from `Course.distribution`. Student copies do not carry it on the
   * course row, so no argument here could supply it reliably; a copy without one produces
   * no summary.
   */
  shareId: string | null;
  evidence: InsightsEvidence;
}

const ISO_WEEK_LABEL = /^\d{4}-W\d{2}$/;

function isAnswered(attempt: QuestionAttempt): boolean {
  return attempt.status === 'answered' && attempt.undoneAt === undefined;
}

/**
 * The analytics criterion identity without its trailing free-text label segment:
 * labels and names stay client-side (issue #589) while the rest of the key remains
 * analytics-defined, so criterion cells stay mergeable across copies and content
 * revisions.
 */
function criterionIdentity(criterion: QuestionCriterionPerformance): string {
  return criterion.id.slice(0, criterion.id.length - criterion.label.length - 1);
}

/**
 * Reduce one device's week of local study for one published course to the only thing
 * the relay may receive in readable form: an anonymous counted summary.
 *
 * Returns null when the course has no share link id (not published, or imported as a
 * plain course file without a link), making it invisible to class insights rather than
 * guessable. A week with no activity still produces a row with `a: false`, so the
 * relay can size the cohort of opted-in devices without storing anything identifying
 * about them; cells only appear where this device has evidence, letting the relay
 * count contributors per cell.
 */
export function summariseForInsights(options: SummariseForInsightsOptions): InsightSummary | null {
  const { week, shareId, evidence } = options;
  if (!ISO_WEEK_LABEL.test(week)) {
    throw new Error('week must be an ISO 8601 label like 2026-W07');
  }
  if (!shareId) return null;

  const cards = new Map<string, { numerator: number; denominator: number }>();
  for (const review of evidence.reviews) {
    const aggregate = cards.get(review.conceptId) ?? { numerator: 0, denominator: 0 };
    aggregate.numerator += review.retained ? 1 : 0;
    aggregate.denominator += 1;
    cards.set(review.conceptId, aggregate);
  }
  const cardCells: InsightsCell[] = [...cards]
    .filter(([, aggregate]) => aggregate.denominator > 0)
    .map(([identity, aggregate]): InsightsCell => ({
      i: identity,
      n: aggregate.numerator,
      d: aggregate.denominator,
    }))
    .sort((left, right) => left.i.localeCompare(right.i));

  const analytics = buildQuestionAnalytics(evidence.questions, evidence.attempts);
  const criterionCells: InsightsCell[] = analytics.criteria
    .filter((criterion) => criterion.marksAvailable > 0)
    .map((criterion): InsightsCell => ({
      i: criterionIdentity(criterion),
      n: criterion.marksEarned,
      d: criterion.marksAvailable,
    }));

  return {
    v: INSIGHTS_SCHEMA_VERSION,
    s: shareId,
    w: week,
    a: evidence.reviews.length > 0 || evidence.attempts.some(isAnswered),
    co: cardCells,
    cr: criterionCells,
  };
}
