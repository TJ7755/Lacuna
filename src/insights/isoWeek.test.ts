import { describe, expect, it } from 'vitest';
import {
  completedIsoWeekLabel,
  ISO_WEEK_LABEL_RE,
  isoWeekLabel,
  isoWeekStartMs,
  parseIsoWeekLabel,
  previousIsoWeek,
} from './isoWeek';

// The week grid class insights sends on. Anchors from the UTC ISO grid: the week
// containing Thursday 1 January 2026 is 2026-W01 (Mon 29 Dec 2025 onward); 2026
// runs to W53 (Mon 28 Dec 2026 starts it, because 1 January 2027 makes its
// 2026-W53 week end); 12-18 October 2026 is exactly the trial week W42.

describe('isoWeekLabel', () => {
  it.each([
    { instant: Date.UTC(2025, 11, 29), label: '2026-W01' },
    { instant: Date.UTC(2026, 0, 4), label: '2026-W01' },
    { instant: Date.UTC(2026, 0, 4, 23, 59, 59), label: '2026-W01' },
    { instant: Date.UTC(2026, 0, 5), label: '2026-W02' },
    { instant: Date.UTC(2026, 2, 15, 14, 30), label: '2026-W11' },
    { instant: Date.UTC(2026, 9, 15, 9, 0), label: '2026-W42' },
    { instant: Date.UTC(2026, 9, 18, 23, 59, 59), label: '2026-W42' },
    { instant: Date.UTC(2026, 9, 19, 0, 0, 0), label: '2026-W43' },
    { instant: Date.UTC(2026, 11, 27, 23, 59, 59), label: '2026-W52' },
    { instant: Date.UTC(2026, 11, 28, 0, 0, 0), label: '2026-W53' },
    { instant: Date.UTC(2027, 0, 1), label: '2026-W53' },
    { instant: Date.UTC(2027, 0, 4, 0, 0, 0), label: '2027-W01' },
  ])('labels $instant as $label', ({ instant, label }) => {
    expect(isoWeekLabel(instant)).toBe(label);
    expect(label).toMatch(ISO_WEEK_LABEL_RE);
  });
});

describe('parseIsoWeekLabel', () => {
  it('round-trips into the same label via the week start', () => {
    const label = isoWeekLabel(Date.UTC(2026, 9, 15, 9, 0));
    expect(parseIsoWeekLabel(label)).toEqual({ year: 2026, week: 42 });
    expect(isoWeekLabel(isoWeekStartMs(label))).toBe(label);
  });

  it('rejects labels outside the compact format', () => {
    expect(parseIsoWeekLabel('October week 3')).toBeNull();
    expect(parseIsoWeekLabel('2026-W00')).toBeNull();
    expect(parseIsoWeekLabel('2026-W99')).toBeNull();
    expect(parseIsoWeekLabel('2026-W42 ')).toBeNull();
    expect(parseIsoWeekLabel('')).toBeNull();
  });

  it('throws everywhere else only where a caller cannot proceed without a label', () => {
    expect(() => isoWeekStartMs('October week 3')).toThrow(/ISO 8601 label/);
  });
});

describe('isoWeekStartMs', () => {
  it('lands on the UTC Monday of the labelled week', () => {
    expect(isoWeekStartMs('2026-W01')).toBe(Date.UTC(2025, 11, 29));
    expect(isoWeekStartMs('2026-W42')).toBe(Date.UTC(2026, 9, 12));
    expect(isoWeekStartMs('2026-W53')).toBe(Date.UTC(2026, 11, 28));
    expect(isoWeekStartMs('2027-W01')).toBe(Date.UTC(2027, 0, 4));
    expect(new Date(isoWeekStartMs('2026-W05')).getUTCDay()).toBe(1);
  });

  it('advances by exactly one week per label', () => {
    expect(isoWeekStartMs('2026-W43') - isoWeekStartMs('2026-W42')).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('previousIsoWeek', () => {
  it('crosses the year rollover without arithmetic surprises', () => {
    expect(previousIsoWeek('2026-W01')).toBe('2025-W52');
    expect(previousIsoWeek('2027-W01')).toBe('2026-W53');
    expect(previousIsoWeek('2026-W42')).toBe('2026-W41');
    expect(previousIsoWeek(previousIsoWeek('2026-W42'))).toBe('2026-W40');
  });
});

describe('completedIsoWeekLabel', () => {
  it('returns the running week itself as uncompleted until its Monday rolls over', () => {
    // Sunday evening is *nearly* finished but the week is still running.
    expect(completedIsoWeekLabel(Date.UTC(2026, 9, 18, 23, 0))).toBe('2026-W41');
    // Monday 00:00:00.000 is the exact instant W42 has fully completed.
    expect(completedIsoWeekLabel(Date.UTC(2026, 9, 19, 0, 0, 0))).toBe('2026-W42');
    // Late on New Year's Eve, last year's final week is the completed one.
    expect(completedIsoWeekLabel(Date.UTC(2027, 0, 4, 23, 59, 59))).toBe('2026-W53');
  });
});
