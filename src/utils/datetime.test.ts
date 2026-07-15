import { describe, expect, it } from 'vitest';
import {
  defaultExamDate,
  fromDateTimeLocalValue,
  relativeExam,
  startOfDay,
  toDateTimeLocalValue,
} from './datetime';

describe('datetime-local conversion', () => {
  it.each([
    ['UTC', '2026-01-15T09:42'],
    ['Europe/London', '2026-07-15T09:42'],
    ['America/New_York', '2026-07-15T09:42'],
    ['Asia/Kathmandu', '2026-07-15T09:42'],
  ])('round-trips minute precision in %s', (timeZone, value) => {
    const instant = fromDateTimeLocalValue(value, timeZone);

    expect(Number.isNaN(instant)).toBe(false);
    expect(toDateTimeLocalValue(instant, timeZone)).toBe(value);
  });

  it.each([
    '',
    'not-a-date',
    '2026-01-15',
    '2026/01/15T09:42',
    '2026-01-15 09:42',
    '2026-01-15T09',
    '2026-01-15T09:42garbage',
  ])('rejects malformed value %j', (value) => {
    expect(fromDateTimeLocalValue(value, 'UTC')).toBeNaN();
  });

  it.each([
    '2026-00-15T09:42',
    '2026-13-15T09:42',
    '2026-02-29T09:42',
    '2026-04-31T09:42',
    '2026-01-15T24:00',
    '2026-01-15T09:60',
  ])('rejects impossible wall-clock value %s', (value) => {
    expect(fromDateTimeLocalValue(value, 'UTC')).toBeNaN();
  });

  it('rejects a local time skipped by a daylight-saving transition', () => {
    expect(fromDateTimeLocalValue('2026-03-08T02:30', 'America/New_York')).toBeNaN();
  });
});

describe('date helpers', () => {
  it('sets the default exam to 23:59 local time seven calendar days later', () => {
    const createdAt = new Date(2026, 0, 10, 12, 30).getTime();
    const expected = new Date(2026, 0, 17, 23, 59).getTime();

    expect(defaultExamDate(createdAt)).toBe(expected);
  });

  it.each([
    ['UTC', Date.UTC(2026, 6, 15, 18), Date.UTC(2026, 6, 15)],
    ['Europe/London', Date.UTC(2026, 6, 15, 18), Date.UTC(2026, 6, 14, 23)],
    ['America/New_York', Date.UTC(2026, 6, 15, 18), Date.UTC(2026, 6, 15, 4)],
  ])('returns the instant at midnight in %s', (timeZone, instant, expected) => {
    expect(startOfDay(instant, timeZone)).toBe(expected);
  });

  it('describes calendar days in the requested zone across a daylight-saving change', () => {
    const now = Date.parse('2026-03-07T17:00:00Z');

    expect(relativeExam(Date.parse('2026-03-07T23:00:00Z'), now, 'America/New_York')).toBe('today');
    expect(relativeExam(Date.parse('2026-03-08T16:00:00Z'), now, 'America/New_York')).toBe(
      'tomorrow',
    );
    expect(relativeExam(Date.parse('2026-03-10T16:00:00Z'), now, 'America/New_York')).toBe(
      'in 3 days',
    );
    expect(relativeExam(Date.parse('2026-03-06T17:00:00Z'), now, 'America/New_York')).toBe('past');
  });

  it('uses the first valid instant when daylight saving skips midnight', () => {
    const timeZone = 'America/Havana';
    const instant = Date.parse('2026-03-08T16:00:00Z');
    const dayStart = startOfDay(instant, timeZone);

    expect(fromDateTimeLocalValue('2026-03-08T00:00', timeZone)).toBeNaN();
    expect(Number.isFinite(dayStart)).toBe(true);
    expect(dayStart).toBe(Date.parse('2026-03-08T05:00:00Z'));
    expect(relativeExam(instant, Date.parse('2026-03-07T16:00:00Z'), timeZone)).toBe('tomorrow');
  });
});
