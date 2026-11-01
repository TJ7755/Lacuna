// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { assessmentTiming } from '../fsrs/assessmentTiming';
import { makeExamDateContext, resolveCardExamDate } from '../fsrs/examDate';
import { hydrateCourse, finalAssessmentForCourse } from './assessmentMigration';
import { simContext } from '../fsrs/forwardSim';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { isLeech } from '@lacuna/core/fsrs/leech';
import { fsrsWeightsFingerprint } from '../fsrs/weightProvenance';
import { restoreReviewUnitPerformance, updateReviewUnitPerformance } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { stampUpdatedAt } from './mutationStamp';
import {
  projectCardForStorage,
  reviewHistoryEntryForCard,
  reviewHistoryEntryIdForEvent,
} from '@lacuna/core/db/reviewHistory';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { isPrimedReview } from '../fsrs/primedReview';
import { db } from './schema';
import { scheduleReviewTrajectorySample, type ReviewUnitKind } from './reviewTrajectory';
import type {
  Card,
  CheckerDisputeReport,
  Grade,
  LineVerdict,
  ReviewLog,
  ReviewSessionKind,
  SchedulerConfig,
  UserPerformance,
} from '@lacuna/core/db/types';

export { sampleReviewTrajectory } from './reviewTrajectory';
export type { ReviewTrajectorySampleArgs } from './reviewTrajectory';
// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface RecordReviewArgs {
  input?: ReviewLog['input'];
  markedBy?: ReviewLog['markedBy'];
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

/**
 * Record a single review: apply the FSRS update to the card, append a review log,
 * update the deck's calibration profile (correct reviews only), and schedule a
 * once-daily SessionHistory trajectory sample after the transaction commits.
 * Returns the updated card (for immediate re-scoring); the optional SessionHistory
 * id is retained for compatibility with older callers and is not available on the
 * immediate review path.
 */
export async function recordReview(args: RecordReviewArgs): Promise<RecordReviewResult> {
  if (!Number.isFinite(args.responseTimeSec) || args.responseTimeSec < 0) {
    throw new Error('Review response time must be a non-negative finite number.');
  }
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
      markedBy,
      input,
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
        db.lessons,
        db.courseAssessments,
        db.lessonCards,
        db.concepts,
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
          ...(input ? { input } : {}),
          ...(markedBy ? { markedBy } : {}),
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
          ...(isPrimedReview(cardBefore.history, sessionId, now) ? { primed: true } : {}),
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

        if (cardBefore.courseId) {
          const courseRecord = await db.courses.get(cardBefore.courseId);
          if (courseRecord) {
            const assessments = await db.courseAssessments
              .where('courseId')
              .equals(courseRecord.id)
              .toArray();
            const course = hydrateCourse(
              courseRecord,
              finalAssessmentForCourse(courseRecord.id, assessments),
            );
            const lessons = await db.lessons.where('courseId').equals(course.id).toArray();
            const links = await db.lessonCards.toArray();
            const concepts = await db.concepts.where('courseId').equals(course.id).toArray();
            const context = makeExamDateContext(course, lessons, assessments, links, concepts);
            updatedCard.due = assessmentTiming(
              updatedCard,
              now,
              resolveCardExamDate(updatedCard, context, now),
              simContext(deck, engine),
            ).due;
          }
        }

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
