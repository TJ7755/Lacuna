import { MS_PER_DAY } from '@lacuna/core/fsrs/params';

/** Days from now until a future instant, clamped at zero (past exams read as "today"). */
export function daysUntil(targetMs: number, nowMs: number = Date.now()): number {
  return Math.max(targetMs - nowMs, 0) / MS_PER_DAY;
}

/**
 * Parse a <input type="datetime-local"> value back to an epoch instant.
 *
 * We manually construct the Date from components rather than passing the raw
 * string to the Date constructor, because browser behaviour for strings like
 * "2026-06-07T23:59" is inconsistent (some parse as local time, some as UTC).
 * This guarantees the value is always interpreted in the user's local timezone.
 *
 * When a `timeZone` is provided, the input is treated as wall-clock time in that
 * zone (e.g. "2026-06-07T23:59" with "America/New_York" means 23:59 in New York).
 */
export function fromDateTimeLocalValue(value: string, timeZone?: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;

  const [, yearPart, monthPart, dayPart, hoursPart, minutesPart] = match;
  const [year, month, day, hours, minutes] = [
    yearPart,
    monthPart,
    dayPart,
    hoursPart,
    minutesPart,
  ].map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return Number.NaN;
  }

  if (!timeZone) {
    // Use the constructor with explicit local-time components to avoid
    // day-overflow issues that can happen when mutating an existing Date.
    const local = new Date(year, month - 1, day, hours, minutes);
    if (
      local.getFullYear() !== year ||
      local.getMonth() !== month - 1 ||
      local.getDate() !== day ||
      local.getHours() !== hours ||
      local.getMinutes() !== minutes
    ) {
      return Number.NaN;
    }
    return local.getTime();
  }

  // Find the UTC ms such that the target time zone shows the given wall-clock time.
  // We start with a naive UTC candidate and iteratively refine.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const getComponents = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  };

  const targetAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  let candidate = targetAsUtc;

  for (let i = 0; i < 5; i++) {
    const c = getComponents(candidate);
    if (
      c.year === year &&
      c.month === month &&
      c.day === day &&
      c.hour === hours &&
      c.minute === minutes
    ) {
      return candidate;
    }
    const candidateAsUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
    candidate += targetAsUtc - candidateAsUtc;
  }

  return Number.NaN;
}

/** Start-of-day epoch for grouping (the first valid instant in the given time zone). */
export function startOfDay(ms: number, timeZone?: string): number {
  const d = new Date(ms);
  if (timeZone) {
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone,
    });
    const parts = dateFormatter.formatToParts(d);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const midnight = fromDateTimeLocalValue(`${year}-${pad(month)}-${pad(day)}T00:00`, timeZone);
    if (Number.isFinite(midnight)) return midnight;

    // Some zones advance their clocks at midnight, so 00:00 is not a valid
    // wall-clock time. Find the first instant whose zoned date is this day.
    const targetDay = year * 10_000 + month * 100 + day;
    const zonedDay = (instant: number) => {
      const dateParts = dateFormatter.formatToParts(new Date(instant));
      const part = (type: string) =>
        Number(dateParts.find((candidate) => candidate.type === type)?.value ?? 0);
      return part('year') * 10_000 + part('month') * 100 + part('day');
    };

    const utcDay = Date.UTC(year, month - 1, day);
    let lower = utcDay - 2 * MS_PER_DAY;
    let upper = utcDay + 2 * MS_PER_DAY;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (zonedDay(middle) < targetDay) lower = middle + 1;
      else upper = middle;
    }
    return lower;
  }
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
