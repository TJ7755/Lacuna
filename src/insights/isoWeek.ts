/**
 * UTC-based ISO 8601 week arithmetic for class insights (issues #589/#591).
 *
 * Device and relay must agree on one week grid or the weekly summaries would
 * straddle boundaries. UTC is chosen deliberately over local time: it is
 * DST-free and deterministic for every device at once, and the class's shared
 * timezone - what actually matters for cohort consistency - is shared anyway.
 *
 * ISO 8601 pins the grid on the year's first Thursday (ISO §3.16): the week
 * containing that Thursday is week 1, weeks start on Monday, and a year runs
 * to 52 or 53 weeks depending on where that Thursday falls. Anchoring on
 * "4 January" instead has caught boundary cases out before, so every rule here
 * derives from the first Thursday directly and `isoWeekStartMs` round-trips
 * labels back into the grid, throwing on labels no real week carries.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
/** Weekday number of Thursday in `getUTCDay` terms (Sunday = 0). */
const THURSDAY = 4;

export interface IsoWeekParts {
  /** ISO week-numbering year (the year of the week's Thursday). */
  year: number;
  /** Week number of the ISO year, 1-53. */
  week: number;
}

/** A `2026-W07`-style ISO 8601 week label. `W00` and `W99` are never produced. */
export const ISO_WEEK_LABEL_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;

/** The timestamp's ISO week label on the UTC grid. */
export function isoWeekLabel(ms: number): string {
  const { year, week } = isoWeekParts(ms);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The label's year and week number, or `null` when it is not an ISO week label. */
export function parseIsoWeekLabel(label: string): IsoWeekParts | null {
  if (!ISO_WEEK_LABEL_RE.test(label)) return null;
  return { year: Number(label.slice(0, 4)), week: Number(label.slice(6)) };
}

/** The UTC instant of the labelled week's Monday 00:00:00.000. */
export function isoWeekStartMs(label: string): number {
  const parts = parseIsoWeekLabel(label);
  if (!parts) throw new Error('week must be an ISO 8601 label like 2026-W07');
  const start = firstThursdayMs(parts.year) - 3 * MS_PER_DAY + (parts.week - 1) * MS_PER_WEEK;
  // A week number one past a real week would drift into the next year; make
  // every label round-trip against the grid instead of trusting the digits.
  if (isoWeekLabel(start + 3 * MS_PER_DAY) !== label) {
    throw new Error('week must be an ISO 8601 label like 2026-W07');
  }
  return start;
}

/** The UTC instant of the year's first ISO Thursday (always 1-7 January). */
function firstThursdayMs(year: number): number {
  const january1 = new Date(Date.UTC(year, 0, 1));
  const thursday = new Date(Date.UTC(year, 0, 1));
  thursday.setUTCDate(thursday.getUTCDate() + ((THURSDAY - january1.getUTCDay() + 7) % 7));
  return thursday.getTime();
}

function isoWeekParts(ms: number): IsoWeekParts {
  const date = new Date(ms);
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);

  const firstThursday = firstThursdayMs(thursday.getUTCFullYear());
  const week = 1 + Math.round((thursday.getTime() - firstThursday) / MS_PER_WEEK);
  return { year: thursday.getUTCFullYear(), week };
}

/** The label of the week immediately before `label` on the UTC grid. */
export function previousIsoWeek(label: string): string {
  return isoWeekLabel(isoWeekStartMs(label) - MS_PER_WEEK);
}

/**
 * The label of the most recent week that has ended by `nowMs`: the running
 * week is incomplete, so it never counts as completed.
 */
export function completedIsoWeekLabel(nowMs: number): string {
  return previousIsoWeek(isoWeekLabel(nowMs));
}
