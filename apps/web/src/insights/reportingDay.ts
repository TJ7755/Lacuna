import {
  DAY_MS,
  INSIGHT_MAX_DAY_ADVANCE_MS,
  isoDayLabel,
  isoDayStartMs,
} from '@lacuna/protocol/insights/index';
import { getComponentsInZone, getLocalTimeZone, startOfDay } from '../utils/datetime';

export interface ReportingWindow {
  start: number;
  end: number;
}

export function reportingDayLabel(at: number): string {
  const { year, month, day } = getComponentsInZone(at);
  return isoDayLabel(Date.UTC(year, month, day));
}

export function completedReportingDay(at: number): string {
  return reportingDayLabel(localMidnight(reportingDayLabel(at)) - 1);
}

export function localReportingWindow(day: string): ReportingWindow {
  const next = isoDayLabel(isoDayStartMs(day) + DAY_MS);
  return { start: localMidnight(day), end: localMidnight(next) };
}

function localMidnight(day: string): number {
  const midnight = new Date(day + 'T00:00:00');
  // Date moves a skipped midnight forward. Find the first valid instant if it
  // lands later than the start of the day.
  if (midnight.getHours() !== 0 || midnight.getMinutes() !== 0)
    return startOfDay(midnight.getTime(), getLocalTimeZone());
  return midnight.getTime();
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
