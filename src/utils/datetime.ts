import { MS_PER_DAY } from '../fsrs/params';

/** The user's current IANA time zone (e.g. 'Europe/London'). */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Days from now until a future instant, clamped at zero (past exams read as "today"). */
export function daysUntil(targetMs: number, nowMs: number = Date.now()): number {
  return Math.max(targetMs - nowMs, 0) / MS_PER_DAY;
}

/** Default exam date: creation + 7 days, set to 23:59 local time. Returns UTC ms. */
export function defaultExamDate(createdAtMs: number = Date.now()): number {
  const d = new Date(createdAtMs);
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

/** Format an epoch instant as a British-style date in the given time zone. */
export function formatDate(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timeZone ?? getLocalTimeZone(),
  });
}

/** Coarse relative-time buckets, largest first, used by {@link formatRelativeTime}. */
const RELATIVE_TIME_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * MS_PER_DAY },
  { unit: 'month', ms: 30 * MS_PER_DAY },
  { unit: 'week', ms: 7 * MS_PER_DAY },
  { unit: 'day', ms: MS_PER_DAY },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

/** Format a past epoch instant as a short relative string, e.g. "3 days ago" or "just now". */
export function formatRelativeTime(ms: number, nowMs: number = Date.now()): string {
  const diff = nowMs - ms;
  if (diff < 60 * 1000) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  for (const { unit, ms: unitMs } of RELATIVE_TIME_UNITS) {
    if (diff >= unitMs) return rtf.format(-Math.round(diff / unitMs), unit);
  }
  return 'just now';
}

/** Format an epoch instant as date and time in the given time zone. */
export function formatDateTime(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone ?? getLocalTimeZone(),
  });
}

/** Convert an epoch instant to the value expected by <input type="datetime-local">. */
export function toDateTimeLocalValue(ms: number, timeZone?: string): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  // When a specific time zone is provided, we want the datetime-local input to
  // show the time in that zone, not the browser's local zone. We reconstruct
  // the components using the zone-aware formatter.
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
  const getComponents = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  };

  let candidate = Date.UTC(year, month - 1, day, hours, minutes);
  const target = { year, month, day, hour: hours, minute: minutes };

  for (let i = 0; i < 5; i++) {
    const c = getComponents(candidate);
    if (
      c.year === target.year &&
      c.month === target.month &&
      c.day === target.day &&
      c.hour === target.hour &&
      c.minute === target.minute
    ) {
      return candidate;
    }
    const targetAsUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
    );
    const candidateAsUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
    candidate += targetAsUtc - candidateAsUtc;
  }

  return Number.NaN;
}

/** Extract year, month (0-based), day, hours, minutes from an epoch instant in a given time zone. */
export function getComponentsInZone(ms: number, timeZone?: string) {
  if (!timeZone) {
    const d = new Date(ms);
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      hours: d.getHours(),
      minutes: d.getMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month') - 1,
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
  };
}

/** Start-of-day epoch for grouping (the first valid instant in the given time zone). */
export function startOfDay(ms: number, timeZone?: string): number {
  const d = new Date(ms);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone,
    }).formatToParts(d);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const midnight = fromDateTimeLocalValue(
      `${getPart('year')}-${pad(getPart('month'))}-${pad(getPart('day'))}T00:00`,
      timeZone,
    );
    if (Number.isFinite(midnight)) return midnight;

    // Some zones advance their clocks at midnight, so 00:00 is not a valid
    // wall-clock time. Find the first instant whose zoned date is this day.
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone,
    });
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

/** A short relative description of a future exam date, e.g. "in 7 days" or "today". */
export function relativeExam(
  targetMs: number,
  nowMs: number = Date.now(),
  timeZone?: string,
): string {
  const targetDay = startOfDay(targetMs, timeZone);
  const today = startOfDay(nowMs, timeZone);
  const days = Math.round((targetDay - today) / MS_PER_DAY);
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
