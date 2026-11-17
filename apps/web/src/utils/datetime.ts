import { startOfDay } from '@lacuna/core/utils/datetime';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';

/** The user's current IANA time zone (e.g. 'Europe/London'). */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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

/** A compact date for chart axes and tight rows, e.g. "12 Jun". */
export function formatShortDate(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
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

/** Whole calendar days from today to the target's day (negative once it has passed). */
export function calendarDaysUntil(
  targetMs: number,
  nowMs: number = Date.now(),
  timeZone?: string,
): number {
  return Math.round((startOfDay(targetMs, timeZone) - startOfDay(nowMs, timeZone)) / MS_PER_DAY);
}

/** A short relative description of a future exam date, e.g. "in 7 days" or "today". */
export function relativeExam(
  targetMs: number,
  nowMs: number = Date.now(),
  timeZone?: string,
): string {
  const days = calendarDaysUntil(targetMs, nowMs, timeZone);
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
