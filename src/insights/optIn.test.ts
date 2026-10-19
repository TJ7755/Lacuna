import { describe, expect, it } from 'vitest';
import { planWeeklyInsightsSend, runWeeklyInsightsSend } from './optIn';

// Timing anchors on the trial grid: 12-18 October 2026 is exactly ISO week 2026-W42,
// Monday 19 October 00:00 Z opens 2026-W43 and completes W42, and short offline gaps
// stand in for the offline-tolerant catch-up of issue #591.

const SUN_OCT_18_MIDDAY = Date.UTC(2026, 9, 18, 12, 0);
const MON_OCT_19_MIDNIGHT = Date.UTC(2026, 9, 19, 0, 0);
const SAT_OCT_31 = Date.UTC(2026, 9, 31, 9, 0);

describe('planWeeklyInsightsSend', () => {
  it('stays idle while opted out, however far behind the marker is', () => {
    expect(
      planWeeklyInsightsSend({ optedIn: false, lastSentWeek: '2026-W39' }, SUN_OCT_18_MIDDAY),
    ).toEqual({ action: 'idle' });
    expect(
      planWeeklyInsightsSend({ optedIn: false, lastSentWeek: null }, SUN_OCT_18_MIDDAY),
    ).toEqual({ action: 'idle' });
  });

  it('never sends the running week', () => {
    // Sunday midday: 2026-W42 is still running, so W42 must not appear.
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: null }, SUN_OCT_18_MIDDAY),
    ).toEqual({
      action: 'send',
      week: '2026-W41',
    });
  });

  it('sends the latest completed week once a week has rolled over', () => {
    const fresh = { optedIn: true, lastSentWeek: null } as const;
    // Monday 00:00:00.000 exactly completes W42.
    expect(planWeeklyInsightsSend(fresh, MON_OCT_19_MIDNIGHT)).toEqual({
      action: 'send',
      week: '2026-W42',
    });
  });

  it('catches up to the latest completed week only, without backfilling skipped weeks', () => {
    // Last sent W39, weeks offline, now in W42: W40 and W41 are never sent;
    // only the latest completed week goes out on the next connection.
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W39' }, SUN_OCT_18_MIDDAY),
    ).toEqual({ action: 'send', week: '2026-W41' });
  });

  it('stays idle once the completed week has already been sent', () => {
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W42' }, SUN_OCT_18_MIDDAY),
    ).toEqual({ action: 'idle' });
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W42' }, MON_OCT_19_MIDNIGHT),
    ).toEqual({ action: 'idle' });
  });

  it('sends again as soon as a newer completed week opens, even across the year rollover', () => {
    // The instant W53 opens, W52 has merely just completed: a marker on W52
    // stops there, and an older marker sends W52 - not the running week.
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W52' }, Date.UTC(2026, 11, 28)),
    ).toEqual({ action: 'idle' });
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W51' }, Date.UTC(2026, 11, 28)),
    ).toEqual({ action: 'send', week: '2026-W52' });
    // By New Year's Monday, 2026-W53 is complete and becomes the catch-up target.
    expect(
      planWeeklyInsightsSend({ optedIn: true, lastSentWeek: '2026-W50' }, Date.UTC(2027, 0, 4)),
    ).toEqual({ action: 'send', week: '2026-W53' });
  });
});

describe('runWeeklyInsightsSend', () => {
  it('marks the week sent only after the transport accepted the send', async () => {
    const marked: string[] = [];
    const outcome = await runWeeklyInsightsSend({
      readState: () => ({ optedIn: true, lastSentWeek: null }),
      markSent: (week) => marked.push(week),
      now: () => SUN_OCT_18_MIDDAY,
      send: async () => undefined,
    });
    expect(outcome).toBe('sent');
    expect(marked).toEqual(['2026-W41']);
  });

  it('does not mark a week when the transport has not run yet', async () => {
    const marked: string[] = [];
    const outcome = await runWeeklyInsightsSend({
      readState: () => ({ optedIn: true, lastSentWeek: null }),
      markSent: (week) => marked.push(week),
      now: () => SUN_OCT_18_MIDDAY,
      send: null, // The wire is undecided in issue #600; the scheduler must not pretend.
    });
    expect(outcome).toBe('blocked');
    expect(marked).toEqual([]);
  });

  it('reports a transport failure without marking, for a retry on the next open', async () => {
    const outcome = await runWeeklyInsightsSend({
      readState: () => ({ optedIn: true, lastSentWeek: null }),
      markSent: () => undefined,
      now: () => SAT_OCT_31,
      send: async () => {
        throw new Error('relay unavailable');
      },
    });
    expect(outcome).toBe('failed');
  });

  it('never calls the transport when the plan says idle', async () => {
    let sent = 0;
    const outcome = await runWeeklyInsightsSend({
      readState: () => ({ optedIn: true, lastSentWeek: '2026-W42' }),
      markSent: () => undefined,
      now: () => SUN_OCT_18_MIDDAY,
      send: async () => {
        sent += 1;
      },
    });
    expect(outcome).toBe('idle');
    expect(sent).toBe(0);
  });
});
