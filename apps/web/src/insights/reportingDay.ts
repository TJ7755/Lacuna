import {
  DAY_MS,
  isoDayLabel,
  isoDayStartMs,
  localReportingDayLabel,
  type ReportingWindow,
} from '@lacuna/protocol/insights/index';
import { getLocalTimeZone, startOfDay } from '../utils/datetime';

export function completedReportingDay(at: number): string {
  return localReportingDayLabel(localMidnight(localReportingDayLabel(at)) - 1);
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
