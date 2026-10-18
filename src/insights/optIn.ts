import { completedIsoWeekLabel, isoWeekStartMs } from './isoWeek';

/**
 * Per-course, per-device opt-in state for class insights (issue #591).
 *
 * Off by default; a student's own choice turns sending on, on this device and
 * this course only. The state is device-local and never carried inside a synced
 * course payload, so sharing a device or moving a course between devices never
 * moves the consent with it.
 */
export interface InsightsOptInState {
  optedIn: boolean;
  /**
   * ISO week label of the last week this device actually sent, or `null` while
   * no send has completed. Recorded only after the transport accepts a send,
   * so a failure on one open retries the same week on the next one.
   */
  lastSentWeek: string | null;
}

export type WeeklyInsightsPlan = { action: 'idle' } | { action: 'send'; week: string };

/**
 * What, if anything, this device should send for a course right now.
 *
 * Sends one summary per completed ISO week (issue #591): the running week is
 * never counted as completed, weeks are never backfilled - after time offline
 * the device catches up to the latest completed week only - and a recorded
 * week suppresses repeats. A week with no local evidence still reports as an
 * inactive summary (issue #589), so participation stays visible to the
 * keyless cohort counts.
 */
export function planWeeklyInsightsSend(
  state: Readonly<InsightsOptInState>,
  nowMs: number,
): WeeklyInsightsPlan {
  if (!state.optedIn) return { action: 'idle' };
  const target = completedIsoWeekLabel(nowMs);
  if (state.lastSentWeek === null || isoWeekStartMs(state.lastSentWeek) < isoWeekStartMs(target)) {
    return { action: 'send', week: target };
  }
  return { action: 'idle' };
}

export type WeeklyInsightsRun = 'idle' | 'sent' | 'blocked' | 'failed';

export interface WeeklyInsightsSendDeps {
  /** Reads the per-course, per-device opt-in state. */
  readState(): InsightsOptInState;
  /** Records the completed send, after the transport has accepted it. */
  markSent(week: string): void;
  now(): number;
  /**
   * The weekly transport, supplied by the wiring layer that knows how to reach
   * the relay. Null while the end-to-end envelope design (issue #600) is
   * undecided: nothing is sent and the mark is not advanced, so the state
   * stays truthful about what actually left the device.
   */
  send: ((week: string) => Promise<void>) | null;
}

/**
 * One scheduler invocation per course per open. Never throws: a transport
 * failure is reported as `failed` and the same week retries on the next open.
 */
export async function runWeeklyInsightsSend(
  deps: WeeklyInsightsSendDeps,
): Promise<WeeklyInsightsRun> {
  const plan = planWeeklyInsightsSend(deps.readState(), deps.now());
  if (plan.action !== 'send') return 'idle';
  if (deps.send === null) return 'blocked';
  try {
    await deps.send(plan.week);
  } catch {
    return 'failed';
  }
  deps.markSent(plan.week);
  return 'sent';
}
