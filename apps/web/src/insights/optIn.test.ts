import { describe, expect, it } from 'vitest';
import { planDailyInsightsSend, runDailyInsightsSend } from './optIn';

const now = Date.parse('2026-10-19T00:00:00Z');
describe('daily insights planning', () => {
  it('stays idle when consent is off', () => {
    expect(planDailyInsightsSend({ optedIn: false, lastSentDay: null }, now)).toEqual({
      action: 'idle',
    });
  });
  it.each([
    ['2026-10-19T00:00:00Z', '2026-10-18'],
    ['2026-10-19T23:59:59Z', '2026-10-18'],
    ['2027-01-01T00:00:00Z', '2026-12-31'],
    ['2024-03-01T12:00:00Z', '2024-02-29'],
  ])('sends only the latest completed UTC day at %s', (time, day) => {
    expect(planDailyInsightsSend({ optedIn: true, lastSentDay: null }, Date.parse(time))).toEqual({
      action: 'send',
      day,
    });
  });
  it('catches up once after offline days without backfilling', () => {
    expect(planDailyInsightsSend({ optedIn: true, lastSentDay: '2026-10-01' }, now)).toEqual({
      action: 'send',
      day: '2026-10-18',
    });
  });
  it('suppresses repeats until the next completed day', () => {
    const state = { optedIn: true, lastSentDay: '2026-10-18' };
    expect(planDailyInsightsSend(state, now)).toEqual({ action: 'idle' });
    expect(planDailyInsightsSend(state, now + 86_400_000)).toEqual({
      action: 'send',
      day: '2026-10-19',
    });
  });
});

describe('daily insights scheduler', () => {
  it('records acceptance after the transport completes and respects opt-out', async () => {
    let optedIn = false,
      calls = 0;
    const marked: string[] = [];
    const deps = {
      readState: () => ({ optedIn, lastSentDay: null }),
      now: () => now,
      markSent: (day: string) => marked.push(day),
      send: async () => {
        calls++;
        expect(marked).toEqual([]);
      },
    };
    expect(await runDailyInsightsSend(deps)).toBe('idle');
    expect(calls).toBe(0);
    optedIn = true;
    expect(await runDailyInsightsSend(deps)).toBe('sent');
    expect(marked).toEqual(['2026-10-18']);
    optedIn = false;
    expect(await runDailyInsightsSend(deps)).toBe('idle');
    expect(calls).toBe(1);
  });
  it('never marks unavailable or failed deliveries as sent', async () => {
    const marked: string[] = [];
    const deps = {
      readState: () => ({ optedIn: true, lastSentDay: null }),
      now: () => now,
      markSent: (day: string) => marked.push(day),
    };
    expect(await runDailyInsightsSend({ ...deps, send: null })).toBe('blocked');
    expect(
      await runDailyInsightsSend({
        ...deps,
        send: async () => {
          throw new Error('offline');
        },
      }),
    ).toBe('failed');
    expect(marked).toEqual([]);
  });
});
