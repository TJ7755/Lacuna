import type { Grade } from '../db/types';
import type { Card, SchedulerConfig } from '../db/types';
import { resolveCardExamDate, type ExamDateContext } from './examDate';
import { predictedRetrievabilityAtHorizon } from './progress';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const GRADE_LABELS: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

function quantity(value: number, unit: string): string {
  const rounded = Math.max(1, Math.round(value));
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`;
}

/** Plain-language feedback for the grade Lacuna recorded and its resulting interval. */
export function reviewFeedbackMessage(grade: Grade, due: number, now = Date.now()): string {
  const interval = Math.max(0, due - now);
  const next =
    interval < HOUR_MS
      ? quantity(interval / MINUTE_MS, 'minute')
      : interval < DAY_MS
        ? quantity(interval / HOUR_MS, 'hour')
        : interval < MONTH_MS
          ? quantity(interval / DAY_MS, 'day')
          : interval < YEAR_MS
            ? quantity(interval / MONTH_MS, 'month')
            : quantity(interval / YEAR_MS, 'year');
  return `${GRADE_LABELS[grade]} · ${grade === 1 ? 'retry' : 'again'} in ${next}`;
}

/**
 * Post-grade feedback as projected exam-day retention for the just-reviewed
 * card, e.g. "Good · 82% recall at exam". Uses the same forward projection as
 * the progress bar so the two always agree (see src/fsrs/progress.ts).
 *
 * Returns null unless a genuine future exam date applies to the card: without
 * one the horizon layer falls back to a rolling maintenance window, and
 * labelling that an "exam" would be dishonest. Callers fall back to
 * {@link reviewFeedbackMessage} in that case. Mirrors the date rule in
 * src/fsrs/horizon.ts.
 */
export function reviewRetentionMessage(
  grade: Grade,
  card: Card,
  deck: SchedulerConfig,
  examDateContext: ExamDateContext | undefined,
  now: number = Date.now(),
): string | null {
  const resolved = examDateContext
    ? resolveCardExamDate(card, examDateContext, now)
    : deck.examDate;
  if (resolved === undefined || resolved < now) return null;
  const percent = Math.round(
    predictedRetrievabilityAtHorizon(card, deck, now, examDateContext) * 100,
  );
  return `${GRADE_LABELS[grade]} · ${percent}% recall at exam`;
}
