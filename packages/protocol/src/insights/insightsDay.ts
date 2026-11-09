export const DAY_MS = 24 * 60 * 60 * 1000;
// A civil date can start this far ahead of its UTC calendar coordinate.
export const INSIGHT_MAX_DAY_ADVANCE_MS = 14 * 60 * 60 * 1000;

export interface ReportingWindow {
  start: number;
  end: number;
}

export function isoDayLabel(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error('Invalid reporting date.');
  return new Date(ms).toISOString().slice(0, 10);
}

export function localReportingDayLabel(ms: number): string {
  const date = new Date(ms);
  const coordinate = new Date(0);
  coordinate.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return isoDayLabel(coordinate.getTime());
}

export function isoDayStartMs(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid reporting day.');
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || isoDayLabel(ms) !== day) throw new Error('Invalid reporting day.');
  return ms;
}

export function completedIsoDayLabel(now: number): string {
  return isoDayLabel(isoDayStartMs(isoDayLabel(now)) - DAY_MS);
}

export function utcReportingWindow(day: string): ReportingWindow {
  const start = isoDayStartMs(day);
  return { start, end: start + DAY_MS };
}

export function validReportingWindow(day: string, { start, end }: ReportingWindow): boolean {
  const utc = utcReportingWindow(day);
  const latestOffset = 12 * 60 * 60 * 1000;
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start < end &&
    start >= utc.start - INSIGHT_MAX_DAY_ADVANCE_MS &&
    start <= utc.start + latestOffset &&
    end >= utc.end - INSIGHT_MAX_DAY_ADVANCE_MS &&
    end <= utc.end + latestOffset
  );
}
