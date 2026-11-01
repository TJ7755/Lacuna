import { completedIsoDayLabel, isoDayStartMs } from '../../../relay/shared/insights/index';

export interface InsightsOptInState {
  optedIn: boolean;
  lastSentDay: string | null;
}

export type DailyInsightsPlan = { action: 'idle' } | { action: 'send'; day: string };

/** One report per completed UTC day; offline catch-up never backfills skipped days. */
export function planDailyInsightsSend(
  state: Readonly<InsightsOptInState>,
  nowMs: number,
): DailyInsightsPlan {
  if (!state.optedIn) return { action: 'idle' };
  const target = completedIsoDayLabel(nowMs);
  if (state.lastSentDay === null || isoDayStartMs(state.lastSentDay) < isoDayStartMs(target)) {
    return { action: 'send', day: target };
  }
  return { action: 'idle' };
}

export type DailyInsightsRun = 'idle' | 'sent' | 'blocked' | 'failed';
export interface DailyInsightsSendDeps {
  readState(): InsightsOptInState;
  markSent(day: string): void;
  now(): number;
  /** Null until the course's teacher key and saved retry packet are available. */
  send: ((day: string) => Promise<void>) | null;
}

/** A failed upload keeps the marker unchanged so the saved packet can be retried. */
export async function runDailyInsightsSend(deps: DailyInsightsSendDeps): Promise<DailyInsightsRun> {
  const plan = planDailyInsightsSend(deps.readState(), deps.now());
  if (plan.action !== 'send') return 'idle';
  if (deps.send === null) return 'blocked';
  try {
    await deps.send(plan.day);
  } catch {
    return 'failed';
  }
  deps.markSent(plan.day);
  return 'sent';
}
