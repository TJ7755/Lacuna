// Pure logic for the `semi-linear` unlock mode's dual gate (Course Architecture
// Plan Addendum 2, §I). No database access; every function takes already-loaded
// data so it can be tested and composed without a live Dexie instance, following
// the same convention as path.ts and the FSRS modules (see src/fsrs/).
//
// This module only computes WHETHER the gate is satisfied. It does not write
// `Lesson.unlockedAt` — that ratchet (a one-way DB write, never cleared once
// set) and its call site at session-completion time are a later task. See the
// doc comment on `nextLessonUnlockCondition` for the intended wiring.
//
// British English throughout.

import type { Card } from '../db/types';

// ---------------------------------------------------------------------------
// 1. lessonTaught
// ---------------------------------------------------------------------------

/**
 * Whether a lesson has been "taught": every card whose `primaryLessonId` is
 * this lesson has been served at least once (FSRS state moved off `New` = 0),
 * regardless of grade. Mirrors the "served" rule in `lessonStatus` (path.ts).
 *
 * A lesson with **zero cards** counts as taught — there is nothing left to
 * serve, so it cannot block the gate (mirrors `lessonStatus`'s empty-lesson
 * handling in path.ts).
 *
 * `lessonCards` should contain only the primary-lesson cards for the specific
 * lesson being evaluated. The caller is responsible for filtering.
 */
export function lessonTaught(lessonCards: Card[]): boolean {
  if (lessonCards.length === 0) return true;
  return lessonCards.every((c) => c.state !== 0);
}

// ---------------------------------------------------------------------------
// 2. nextLessonUnlockCondition
// ---------------------------------------------------------------------------

/**
 * Evaluates the semi-linear dual gate (addendum §I) for unlocking the lesson
 * that follows Lesson N on the path:
 *
 *  1. Lesson N is taught (see `lessonTaught`) — AND
 *  2. if a Practice node was auto-inserted in the path slot immediately after
 *     Lesson N, that practice session has been completed by reaching its
 *     objective (the SessionReport's goal-reached state, e.g.
 *     `isObjectiveComplete` in src/fsrs/objective.ts). A manual exit does NOT
 *     satisfy the gate. If no Practice node exists in that slot, condition 1
 *     alone is sufficient.
 *
 * `practiceGoalReached` encodes the presence/outcome of that practice node
 * directly, rather than this module reaching into session/objective internals:
 *   - `undefined` — no Practice node was in the slot immediately after Lesson N
 *     at the time it mattered; condition 1 alone gates.
 *   - `true`/`false` — a Practice node was present; whether its session reached
 *     its objective (goal-reached), per the caller's own determination.
 *
 * This signature is deliberately callable from two places at session
 * completion time:
 *   - After a **lesson** session: `lessonCards` is Lesson N's cards, and the
 *     caller has already determined (from the path) whether a Practice node
 *     sits immediately after Lesson N — pass its current goal-reached state,
 *     or `undefined` if the slot is empty.
 *   - After a **practice** session that just reached its objective: the caller
 *     re-evaluates with `practiceGoalReached: true` to trigger the ratchet for
 *     any lesson whose gate was blocked only on this practice node.
 *
 * Intended wiring (later task): whenever this returns `true` for some
 * Lesson N+1 whose `unlockedAt` is not yet set, the repository layer (a new
 * ratchet function in src/db/repository.ts) writes `unlockedAt = now` once,
 * never clearing or re-evaluating it afterwards (the gate is a one-way
 * ratchet — addendum §I).
 */
export function nextLessonUnlockCondition(
  lessonCards: Card[],
  practiceGoalReached: boolean | undefined,
): boolean {
  if (!lessonTaught(lessonCards)) return false;
  // No practice node in the slot: condition 1 alone is sufficient.
  if (practiceGoalReached === undefined) return true;
  // A practice node is present: it must have reached its objective.
  return practiceGoalReached;
}
