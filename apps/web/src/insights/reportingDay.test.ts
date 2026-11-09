import { afterEach, expect, it, vi } from 'vitest';
import { completedReportingDay, localReportingWindow } from './reportingDay';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['2026-03-08', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
  ['2026-11-01', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
])('uses both local midnights on %s across daylight saving', (day, startAt, endAt) => {
  vi.stubEnv('TZ', 'America/New_York');
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  expect(localReportingWindow(day)).toEqual({ start, end });
  expect(completedReportingDay(end - 1)).not.toBe(day);
  expect(completedReportingDay(end)).toBe(day);
});
