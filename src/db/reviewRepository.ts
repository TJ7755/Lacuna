// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { applyReview, makeEngine } from '../fsrs/fsrs';
import { addDays } from '../fsrs/heatmap';
import { isLeech } from '../fsrs/leech';
import { predictedRetrievabilityAtHorizon } from '../fsrs/progress';
import { fsrsWeightsFingerprint } from '../fsrs/weightProvenance';
import { startOfDay } from '../utils/datetime';
import { restoreReviewUnitPerformance, updateReviewUnitPerformance } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { stampUpdatedAt } from './mutationStamp';
import {
  projectCardForStorage,
  reviewHistoryEntryForCard,
  reviewHistoryEntryIdForEvent,
} from './reviewHistory';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { db } from './schema';
import type {
  Card,
  CheckerDisputeReport,
  Grade,
  LineVerdict,
  ReviewLog,
  ReviewSessionKind,
  SchedulerConfig,
  SessionHistoryEntry,
  UserPerformance,
} from './types';
// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Which target table owns the reviewed unit. */
type ReviewUnitKind = 'scheduling-unit' | 'course';

export interface RecordReviewArgs {
  card: Card;
  /** Stable caller-owned identity reused if the same submission is retried. */
  eventId: string;
  /** Stable identity shared by attempts in the same study session. */
  sessionId: string;
  sessionKind: ReviewSessionKind;
  /** Optional revision provenance for task-planned review windows. */
  revisionPlanId?: string;
  revisionWindowId?: string;
  /**
   * The scheduling unit (global-Today scope) or Course (course/lesson scope) this
   * review is scheduled and calibrated against. Both satisfy SchedulerConfig, so the
   * FSRS maths is identical either way; only the bookkeeping below (lastInteractedAt
   * table, and the card set the retrievability snapshot spans) differs by `kind`.
   */
  deck: SchedulerConfig;
  /** Defaults to the explicit scheduling-unit projection used by global sessions. */
  kind?: ReviewUnitKind;
  grade: Grade;
  responseTimeSec: number;
  distracted: boolean;
  /** Whether a lines-mode hint was used before this review (see ReviewLog.hintUsed). */
  hintUsed?: boolean;
  /** Whether the answer was correct (grade > 1); drives per-deck calibration stats. */
  correct: boolean;
  /** Machine-awarded marks for structured numeric/working items. */
  marksEarned?: number;
  marksAvailable?: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
  now?: number;
}

/** The result of recording a review: the updated card plus undo bookkeeping. */
export interface RecordReviewResult {
  card: Card;
  /** The exact hydrated state before this transition, used by undo. */
  cardBefore: Card;
  /** False when this eventId had already been committed and no state changed. */
  recorded: boolean;
  /** Id of the SessionHistory row if the post-commit trajectory sample has completed. */
  sessionHistoryId?: number;
  /** The review kind this was recorded against (see {@link RecordReviewArgs.kind}), so
   * the caller can carry it straight into {@link ReviewUndo} without re-deriving it. */
  kind: ReviewUnitKind;
  /**
   * The unit's `lastInteractedAt` immediately before this review overwrote it (undefined
   * if the unit had none yet), so the caller can carry it into {@link ReviewUndo} and
   * restore it on undo.
   */
  lastInteractedAtBefore: number | undefined;
  /**
   * The unit's `updatedAt` immediately before this review overwrote it, so undo
   * can rewind the stamp as well as `lastInteractedAt`.
   */
  updatedAtBefore: number | undefined;
  /** Transaction snapshot used to reject undo after intervening writes. */
  undoStateAfter: string | undefined;
}

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

function scheduleReviewTrajectorySample(args: ReviewTrajectorySampleArgs): void {
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

/**
 * Record a single review: apply the FSRS update to the card, append a review log,
 * update the deck's calibration profile (correct reviews only), and schedule a
 * once-daily SessionHistory trajectory sample after the transaction commits.
 * Returns the updated card (for immediate re-scoring); the optional SessionHistory
 * id is retained for compatibility with older callers and is not available on the
 * immediate review path.
 */
export async function recordReview(args: RecordReviewArgs): Promise<RecordReviewResult> {
  try {
    const {
      card,
      deck,
      eventId,
      sessionId,
      sessionKind,
      revisionPlanId,
      revisionWindowId,
      grade,
      responseTimeSec,
      distracted,
      hintUsed,
      correct,
      marksEarned,
      marksAvailable,
      lineVerdicts,
      checkerDisputes,
    } = args;
    const kind: ReviewUnitKind = args.kind ?? 'scheduling-unit';
    const now = args.now ?? Date.now();

    if (!eventId.trim() || !sessionId.trim()) {
      throw new Error('Review eventId and sessionId must be non-empty.');
    }

    let lastInteractedAtBefore: number | undefined;
    let updatedAtBefore: number | undefined;
    const result = await db.transaction(
      'rw',
      [
        db.cards,
        db.courses,
        db.schedulingUnits,
        db.sessionHistory,
        db.coursePerformance,
        db.schedulingPerformance,
        db.reviewHistory,
      ],
      async () => {
        const existingReview = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(eventId));
        const existingSession = await db.sessionHistory.where('eventId').equals(eventId).first();
        if (existingReview || existingSession) {
          const persistedCard = await db.cards.get(card.id);
          if (!persistedCard || existingReview?.cardId !== card.id) {
            throw new Error(`Review event ${eventId} belongs to another attempt.`);
          }
          const hydratedCard = (await hydrateCardsWithHistory([persistedCard]))[0];
          return {
            card: hydratedCard,
            cardBefore: hydratedCard,
            recorded: false,
            sessionHistoryId: existingSession?.id,
            kind,
            lastInteractedAtBefore: undefined,
            updatedAtBefore: undefined,
            undoStateAfter: undefined,
          };
        }

        const persistedCardBefore = await db.cards.get(card.id);
        if (!persistedCardBefore) throw new Error('The reviewed card no longer exists.');
        const cardBefore = (await hydrateCardsWithHistory([persistedCardBefore]))[0];

        // Compute from the transaction's current card, not the caller's potentially
        // stale snapshot. Duplicate detection and the one FSRS transition are atomic.
        const engine = makeEngine(deck.fsrsParameters);
        const { memory, retrievabilityAtReview } = applyReview(engine, cardBefore, grade, now);
        const log: ReviewLog = {
          eventId,
          sessionId,
          sessionKind,
          revisionPlanId,
          revisionWindowId,
          timestamp: now,
          grade,
          correct,
          responseTimeSec,
          distracted,
          hintUsed: hintUsed ?? false,
          marksEarned,
          marksAvailable,
          lineVerdicts,
          checkerDisputes,
          stabilityBefore: cardBefore.stability,
          stabilityAfter: memory.stability,
          difficultyBefore: cardBefore.difficulty,
          difficultyAfter: memory.difficulty,
          retrievabilityAtReview,
          fsrsWeightsFingerprint: fsrsWeightsFingerprint(deck.fsrsParameters),
        };
        const updatedCard: Card = {
          ...cardBefore,
          stability: memory.stability,
          difficulty: memory.difficulty,
          lastReviewed: memory.lastReviewed,
          due: memory.due,
          scheduledDays: memory.scheduledDays,
          learningSteps: memory.learningSteps,
          reps: memory.reps,
          lapses: memory.lapses,
          state: memory.state,
          history: [...cardBefore.history, log],
        };

        const action = deck.leechAction ?? 'suspend';
        const threshold = deck.leechThreshold;
        if (
          action !== 'none' &&
          isLeech(updatedCard, threshold) &&
          !isLeech(cardBefore, threshold)
        ) {
          if (action === 'suspend') {
            updatedCard.suspended = true;
          } else if (action === 'tag') {
            const tags = updatedCard.tags ?? [];
            if (!tags.includes('leech')) updatedCard.tags = [...tags, 'leech'];
          }
        }

        const stampedCard = stampUpdatedAt(updatedCard, now);
        await db.cards.put(projectCardForStorage(stampedCard));
        await db.reviewHistory.put(reviewHistoryEntryForCard(stampedCard, log));
        if (kind === 'course') {
          const before = await db.courses.get(deck.id);
          lastInteractedAtBefore = before?.lastInteractedAt;
          updatedAtBefore = before?.updatedAt;
          await db.courses.update(deck.id, stampUpdatedAt({ lastInteractedAt: now }, now));
        } else {
          const before = await db.schedulingUnits.get(deck.id);
          lastInteractedAtBefore = before?.lastInteractedAt;
          updatedAtBefore = before?.updatedAt;
          await db.schedulingUnits.update(deck.id, stampUpdatedAt({ lastInteractedAt: now }, now));
        }

        if (correct) {
          await updateReviewUnitPerformance(deck.id, responseTimeSec, kind);
        }

        return {
          card: stampedCard,
          cardBefore,
          recorded: true,
          kind,
          lastInteractedAtBefore,
          updatedAtBefore,
          undoStateAfter: await reviewUndoState(card.id, deck.id, kind),
        };
      },
    );
    if (result.recorded) {
      scheduleReviewTrajectorySample({
        eventId,
        sessionId,
        revisionPlanId,
        revisionWindowId,
        timestamp: now,
        deck,
        kind,
        cardId: result.card.id,
      });
    }
    return result;
  } catch (err) {
    // A transaction in another tab can win the unique eventId race after this
    // transaction's initial lookup. Resolve that replay as the same no-op result.
    const existingReview = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(args.eventId));
    const existingSession = await db.sessionHistory.where('eventId').equals(args.eventId).first();
    if (existingReview || existingSession) {
      const persistedCard = await db.cards.get(args.card.id);
      if (persistedCard && existingReview?.cardId === args.card.id) {
        const hydratedCard = (await hydrateCardsWithHistory([persistedCard]))[0];
        return {
          card: hydratedCard,
          cardBefore: hydratedCard,
          recorded: false,
          sessionHistoryId: existingSession?.id,
          kind: args.kind ?? 'scheduling-unit',
          lastInteractedAtBefore: undefined,
          updatedAtBefore: undefined,
          undoStateAfter: undefined,
        };
      }
    }
    throw friendlyDbError(err);
  }
}

/** Snapshot needed to reverse a single review (see undoReview). */
export interface ReviewUndo {
  /** Stable review identity; makes repeated or stale undo requests harmless. */
  eventId: string;
  /** The card exactly as it was before the review. */
  cardBefore: Card;
  /** The deck's calibration profile before the review (null if none existed). */
  perfBefore: UserPerformance | null;
  /** The optional SessionHistory row id written by the daily post-commit sample. */
  sessionHistoryId?: number;
  /**
   * The UserPerformance-shaped key of the scheduling unit or Course reviewed.
   */
  deckId: string;
  /**
   * Which target table `deckId` belongs to: a scheduling unit or Course.
   * Recorded by `recordReview` (see {@link RecordReviewResult.kind}) so the
   * `lastInteractedAt` restore on undo knows which table to look the id up in.
   */
  kind: ReviewUnitKind;
  /**
   * The unit's `lastInteractedAt` immediately before the review (see
   * {@link RecordReviewResult.lastInteractedAtBefore}), restored on undo. Undefined if
   * the unit had no prior interaction.
   */
  lastInteractedAtBefore: number | undefined;
  /**
   * The unit's `updatedAt` immediately before the review (see
   * {@link RecordReviewResult.updatedAtBefore}), restored on undo.
   */
  updatedAtBefore: number | undefined;
  /** Transaction snapshot used to reject undo after intervening writes. */
  undoStateAfter: string | undefined;
}

// Read inside the caller's transaction. Timestamps alone cannot distinguish
// writes in the same millisecond, and calibration is shared by several cards.
async function reviewUndoState(
  cardId: string,
  unitId: string,
  kind: ReviewUnitKind,
): Promise<string> {
  const card = await db.cards.get(cardId);
  const unit =
    kind === 'course' ? await db.courses.get(unitId) : await db.schedulingUnits.get(unitId);
  const performance =
    kind === 'course'
      ? await db.coursePerformance.get(unitId)
      : await db.schedulingPerformance.get(unitId);
  return JSON.stringify([card, unit, performance]);
}

/**
 * Reverse the most recent review: restore the card and the deck's calibration
 * profile wholesale (no Welford inverse maths) and delete its review event and
 * any post-commit SessionHistory sample. Single-step, used by the in-session Undo
 * affordance.
 */
export async function undoReview(undo: ReviewUndo): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.cards,
        db.courses,
        db.schedulingUnits,
        db.sessionHistory,
        db.coursePerformance,
        db.schedulingPerformance,
        db.reviewHistory,
      ],
      async () => {
        const session =
          (undo.sessionHistoryId === undefined
            ? await db.sessionHistory.where('eventId').equals(undo.eventId).first()
            : await db.sessionHistory.get(undo.sessionHistoryId)) ??
          (await db.sessionHistory.where('eventId').equals(undo.eventId).first());
        const reviewEvent = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(undo.eventId));
        if (!session && !reviewEvent) return;
        if (session && session.eventId !== undo.eventId) {
          throw new Error('The review event no longer matches its session history entry.');
        }
        if (
          !undo.undoStateAfter ||
          undo.undoStateAfter !==
            (await reviewUndoState(undo.cardBefore.id, undo.deckId, undo.kind))
        ) {
          throw new Error(
            'The card or scheduling unit changed after this review, so undo is no longer available.',
          );
        }
        await db.cards.put(projectCardForStorage(undo.cardBefore));
        await restoreReviewUnitPerformance(undo.deckId, undo.perfBefore, undo.kind);
        // Dexie's update() deletes the property when the patch value is undefined, so
        // this also correctly restores "never interacted" (no prior lastInteractedAt).
        if (undo.kind === 'course') {
          await db.courses.update(undo.deckId, {
            lastInteractedAt: undo.lastInteractedAtBefore,
            updatedAt: undo.updatedAtBefore,
          });
        } else {
          await db.schedulingUnits.update(undo.deckId, {
            lastInteractedAt: undo.lastInteractedAtBefore,
            updatedAt: undo.updatedAtBefore,
          });
        }
        await db.reviewHistory.delete(reviewHistoryEntryIdForEvent(undo.eventId));
        if (session?.id !== undefined) await db.sessionHistory.delete(session.id);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
