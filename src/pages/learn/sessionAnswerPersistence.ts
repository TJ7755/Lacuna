import type { SessionState } from './sessionMachine';
import { db, makeId } from '../../db/schema';
import type { SessionEvent } from '../../course/sessionSummary';
import { performanceForReviewUnit } from '../../db/backingDecks';
import { upsertLessonCardExposure } from '../../db/lessonRepository';
import { undoReview, type RecordReviewArgs, type ReviewUndo } from '../../db/reviewRepository';
import type { LessonCardExposure, UserPerformance } from '../../db/types';
import { persistAnswer } from './answerSteps';

/** What undoing the most recent answer needs to restore (DB + in-session state). */
export interface AnswerSnapshot {
  machine: SessionState;
  input?: 'typed' | 'reveal';
  responseTimeSec: number;
  retainOnCompletion: boolean;
  undo: ReviewUndo;
  deckId: string;
  deckReviews: number;
  simple?: { exposureAdded: LessonCardExposure | null };
}

/** Persist a Simple review and its introduction exposure as one reversible write. */
export async function persistSimpleSessionAnswer(
  unitId: string,
  performance: UserPerformance | undefined,
  readReview: () => RecordReviewArgs,
  getExposureLessonId: () => string | null,
) {
  return db.transaction(
    'rw',
    [
      db.cards,
      db.courses,
      db.schedulingUnits,
      db.sessionHistory,
      db.coursePerformance,
      db.schedulingPerformance,
      db.reviewHistory,
      db.lessonCardExposures,
    ],
    async () => {
      const { card, correct, kind } = readReview();
      const perfBefore = (await performanceForReviewUnit(unitId, kind)) ?? null;
      const lessonId = correct ? getExposureLessonId() : null;
      const exposureBefore = lessonId
        ? await db.lessonCardExposures.get([lessonId, card.id])
        : undefined;
      const { result, performance: nextPerf } = await persistAnswer(
        readReview(),
        unitId,
        performance,
      );
      const exposureAdded =
        lessonId && !exposureBefore ? await upsertLessonCardExposure(lessonId, card.id) : null;
      return { result, nextPerf, perfBefore, exposureAdded };
    },
  );
}

/** Refuse undo if another writer has replaced the exposure created by this answer. */
export async function undoSessionAnswer(
  undo: ReviewUndo,
  exposure: LessonCardExposure | null | undefined,
): Promise<void> {
  return db.transaction(
    'rw',
    [
      db.cards,
      db.courses,
      db.schedulingUnits,
      db.sessionHistory,
      db.coursePerformance,
      db.schedulingPerformance,
      db.reviewHistory,
      db.lessonCardExposures,
    ],
    async () => {
      if (exposure) {
        const key: [string, string] = [exposure.lessonId, exposure.cardId];
        const currentExposure = await db.lessonCardExposures.get(key);
        if (JSON.stringify(currentExposure) !== JSON.stringify(exposure)) {
          throw new Error(
            'The lesson exposure changed after this answer, so undo is no longer available.',
          );
        }
        await db.lessonCardExposures.delete(key);
      }
      await undoReview(undo);
    },
  );
}

/** Persist a recited line with its manual grade, without updating cached performance. */
export async function persistRecitationReview(
  review: Omit<RecordReviewArgs, 'eventId' | 'grade' | 'distracted' | 'hintUsed'>,
) {
  const grade = review.correct ? 3 : 1;
  const { result } = await persistAnswer(
    { ...review, eventId: makeId(), grade, distracted: false, hintUsed: false },
    review.deck.id,
    undefined,
  );
  const event: SessionEvent = {
    cardId: review.card.id,
    grade,
    correct: review.correct,
    responseTimeSec: review.responseTimeSec,
    distracted: false,
  };
  return { card: result.card, event };
}
