import type { Grade } from '../db/types';

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
