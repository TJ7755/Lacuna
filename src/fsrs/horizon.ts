// The scheduling horizon: the single date the scheduler and the progress bar
// both aim a deck's cards at.
//
// While an exam is still in the future this is simply `deck.examDate`. The
// awkward case is once that date has passed: `daysUntil` clamps to zero, every
// card then reads R = 1 on a date that is already gone, the progress bar pins to
// 100%, and the deck quietly stops scheduling. To avoid that bogus state we keep
// revising against a rolling horizon a fixed number of days ahead, so the maths
// stays sane and progress reflects *maintained* retention rather than a date in
// the past. Archived decks are removed from study entirely and never reach here.
//
// Everything that schedules or reports progress must read the horizon through
// this module so the core invariant (scheduler and progress bar derived from the
// same objective) survives the exam passing.

import { MS_PER_DAY } from './params';
import { resolveCardExamDate, type ExamDateContext } from './examDate';
import type { Card, SchedulerConfig } from '../db/types';

/**
 * How many days ahead a passed-exam deck schedules against when the user keeps
 * revising. A week keeps the deck maintaining its target retention without
 * pretending there is a real deadline. Stated in the post-exam help copy.
 */
export const MAINTENANCE_HORIZON_DAYS = 7;

/** Whether the deck's exam date is now in the past.
 *  Accepts any SchedulerConfig (a Deck or a Course); only examDate is read. */
export function examHasPassed(deck: SchedulerConfig, now: number = Date.now()): boolean {
  return deck.examDate < now;
}

/**
 * The date all scheduling and progress for this deck should target. The future
 * exam date while it is ahead of us; a rolling maintenance horizon once it has
 * passed (the "keep revising" fallback). Accepts any SchedulerConfig (a Deck or
 * a Course); only examDate is read.
 */
export function schedulingHorizon(deck: SchedulerConfig, now: number = Date.now()): number {
  if (deck.examDate >= now) return deck.examDate;
  return now + MAINTENANCE_HORIZON_DAYS * MS_PER_DAY;
}

/**
 * The scheduling horizon for one card. Course callers may provide an exam-date
 * context so lesson overrides and applicable checkpoints determine the target;
 * legacy deck callers omit it and retain the deck-wide horizon.
 */
export function cardSchedulingHorizon(
  card: Card,
  deck: SchedulerConfig,
  examDateContext?: ExamDateContext,
  now: number = Date.now(),
): number {
  if (!examDateContext) return schedulingHorizon(deck, now);
  const examDate = resolveCardExamDate(card, examDateContext, now);
  return examDate >= now
    ? examDate
    : now + MAINTENANCE_HORIZON_DAYS * MS_PER_DAY;
}
