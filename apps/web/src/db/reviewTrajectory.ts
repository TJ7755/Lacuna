import { addDays } from '../fsrs/heatmap';
import { predictedRetrievabilityAtHorizon } from '../fsrs/progress';
import { startOfDay } from '../utils/datetime';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import { db } from './schema';
import type { SchedulerConfig, SessionHistoryEntry } from './types';

/** Which target table owns the reviewed unit. */
export type ReviewUnitKind = 'scheduling-unit' | 'course';

export interface ReviewTrajectorySampleArgs {
  eventId: string;
  sessionId: string;
  revisionPlanId?: string;
  revisionWindowId?: string;
  timestamp: number;
  deck: SchedulerConfig;
  kind: ReviewUnitKind;
  cardId: string;
}

const TRAJECTORY_BATCH_SIZE = 64;
const TRAJECTORY_BATCH_BUDGET_MS = 8;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function trajectoryUnitMatches(
  entry: SessionHistoryEntry,
  kind: ReviewUnitKind,
  unitId: string,
): boolean {
  return kind === 'course'
    ? entry.courseId === unitId
    : entry.schedulingUnitId === unitId && !entry.courseId;
}

async function hasTrajectorySampleForToday(
  kind: ReviewUnitKind,
  unitId: string,
  now: number,
): Promise<boolean> {
  const dayStart = startOfDay(now);
  const nextDay = addDays(dayStart, 1);
  return Boolean(
    await db.sessionHistory
      .where('timestamp')
      .between(dayStart, nextDay, true, false)
      .filter((entry) => trajectoryUnitMatches(entry, kind, unitId))
      .first(),
  );
}

/** Write one historical trajectory sample after a review has committed. */
type TrajectorySampleResult = 'sampled' | 'already-sampled' | 'missing-event';

export async function sampleReviewTrajectory(
  args: ReviewTrajectorySampleArgs,
): Promise<TrajectorySampleResult> {
  if (await hasTrajectorySampleForToday(args.kind, args.deck.id, args.timestamp)) {
    return 'already-sampled';
  }
  const candidate = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(args.eventId));
  if (!candidate || candidate.cardId !== args.cardId) return 'missing-event';

  const cards =
    args.kind === 'course'
      ? await db.cards.where('courseId').equals(args.deck.id).toArray()
      : await db.cards.where('schedulingUnitId').equals(args.deck.id).toArray();
  let total = 0;
  let batchStartedAt = performance.now();
  for (let index = 0; index < cards.length; index += 1) {
    total += predictedRetrievabilityAtHorizon(cards[index], args.deck, args.timestamp);
    const batchFull = (index + 1) % TRAJECTORY_BATCH_SIZE === 0;
    const budgetSpent = performance.now() - batchStartedAt >= TRAJECTORY_BATCH_BUDGET_MS;
    if (index + 1 < cards.length && (batchFull || budgetSpent)) {
      await yieldToEventLoop();
      batchStartedAt = performance.now();
    }
  }
  const averagePredictedRetrievability = cards.length > 0 ? total / cards.length : 1;

  // Re-check inside the write transaction so concurrent reviews cannot create
  // two same-day samples, and undo cannot resurrect a deleted review.
  return db.transaction('rw', [db.reviewHistory, db.sessionHistory], async () => {
    const event = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(args.eventId));
    if (!event || event.cardId !== args.cardId) return 'missing-event';
    if (await hasTrajectorySampleForToday(args.kind, args.deck.id, args.timestamp)) {
      return 'already-sampled';
    }
    await db.sessionHistory.add({
      eventId: args.eventId,
      sessionId: args.sessionId,
      revisionPlanId: args.revisionPlanId,
      revisionWindowId: args.revisionWindowId,
      timestamp: args.timestamp,
      deckId: event.deckId ?? args.deck.id,
      ...(args.kind === 'course' ? { courseId: args.deck.id } : { schedulingUnitId: args.deck.id }),
      averagePredictedRetrievability,
    });
    return 'sampled';
  });
}

interface ScheduledTrajectorySample {
  candidates: ReviewTrajectorySampleArgs[];
}

const scheduledTrajectorySamples = new Map<string, ScheduledTrajectorySample>();

function trajectoryScheduleKey(args: ReviewTrajectorySampleArgs): string {
  return `${args.kind}:${args.deck.id}:${startOfDay(args.timestamp)}`;
}

function afterNextPaint(callback: () => void): void {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    callback();
  };
  const fallback = globalThis.setTimeout(start, 250);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      globalThis.clearTimeout(fallback);
      globalThis.setTimeout(start, 0);
    });
    return;
  }
  globalThis.clearTimeout(fallback);
  globalThis.setTimeout(start, 0);
}

export function scheduleReviewTrajectorySample(args: ReviewTrajectorySampleArgs): void {
  const key = trajectoryScheduleKey(args);
  const scheduled = scheduledTrajectorySamples.get(key);
  if (scheduled) {
    if (!scheduled.candidates.some((candidate) => candidate.eventId === args.eventId)) {
      scheduled.candidates.push(args);
    }
    return;
  }

  const pending = { candidates: [args] };
  scheduledTrajectorySamples.set(key, pending);
  afterNextPaint(() => {
    void (async () => {
      try {
        for (;;) {
          const candidates = pending.candidates.slice();
          let foundCanonicalEvent = false;
          for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const result = await sampleReviewTrajectory(candidates[index]);
            if (result !== 'missing-event') {
              foundCanonicalEvent = true;
              break;
            }
          }
          if (foundCanonicalEvent || pending.candidates.length === candidates.length) break;
        }
      } catch {
        // A missing analytics point must not reject a committed review.
      } finally {
        if (scheduledTrajectorySamples.get(key) === pending) {
          scheduledTrajectorySamples.delete(key);
        }
      }
    })();
  });
}
