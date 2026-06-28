// Pure path-logic module for the course path view.
//
// All functions that depend on the current time accept `now: number = Date.now()`
// as their last optional parameter, following the same convention as the FSRS
// modules (see src/fsrs/). No database access; every function takes already-loaded
// data so it can be tested and composed without a live Dexie instance.
//
// British English throughout.

import type { Card, Course, CourseExamDate, Lesson } from '../db/types';
import { MS_PER_DAY } from '../fsrs/params';

// ---------------------------------------------------------------------------
// Node type registry (addendum K).
// The renderer switches exhaustively over KNOWN_NODE_TYPES for full TypeScript
// safety and falls back to a neutral placeholder for any unknown type — so a
// course exported by a future build with plugin node types still renders.
// ---------------------------------------------------------------------------

/** The set of node types this build knows how to render. Practice types are added in Phase 6. */
export const KNOWN_NODE_TYPES = ['lesson', 'checkpoint'] as const;

/**
 * A string rather than a literal union so that future plugin node types do not
 * require a database schema migration to add.
 */
export type PathNodeType = string;

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

/** Display state of a lesson node on the path. */
export type LessonStatus = 'completed' | 'available' | 'locked';

/** A lesson rendered as a path node. */
export interface LessonPathNode {
  id: string;
  nodeType: 'lesson';
  lesson: Lesson;
  status: LessonStatus;
}

/**
 * A checkpoint (CourseExamDate) rendered as a path node.
 * Checkpoints are informational and never gate progression (addendum G).
 */
export interface CheckpointPathNode {
  id: string;
  nodeType: 'checkpoint';
  examDate: CourseExamDate;
  /**
   * ID of the lesson immediately before this checkpoint on the path, or null
   * when the checkpoint follows an empty lesson list.
   */
  afterLessonId: string | null;
}

/** A discriminated union of every path-node view model this build defines. */
export type PathNode = LessonPathNode | CheckpointPathNode;

// ---------------------------------------------------------------------------
// 1. lessonEffectiveReleaseDates
// ---------------------------------------------------------------------------

/**
 * Computes the effective release date for every lesson under `linear` unlock mode.
 *
 * Walks core (non-extension) lessons in ascending `orderIndex` order:
 *   - Cursor starts at `course.linearCadence.anchorDate`.
 *   - If a lesson carries an explicit `releaseDate` override, the cursor is moved
 *     to it — cascading the change forward to every subsequent lesson.
 *   - The current cursor value is assigned to the lesson; the cursor then
 *     advances by `intervalDays × MS_PER_DAY`.
 *
 * Extension lessons are SKIPPED entirely: they neither consume a slot in the
 * walk (which would silently shift every subsequent date by one interval) nor
 * receive a date (they are always unlocked by addendum B).
 *
 * Returns `Map<lessonId, number | undefined>`:
 *   - Core lessons under a defined cadence → epoch-ms effective release date.
 *   - Core lessons when `linearCadence` is absent → `undefined` (treat as unlocked).
 *   - Extension lessons → `undefined` (always unlocked; date is irrelevant).
 */
export function lessonEffectiveReleaseDates(
  course: Course,
  lessons: Lesson[],
): Map<string, number | undefined> {
  const result = new Map<string, number | undefined>();
  const sorted = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);

  if (!course.linearCadence) {
    // No cadence defined: mark all lessons as unlocked (undefined = no gate).
    for (const lesson of sorted) {
      result.set(lesson.id, undefined);
    }
    return result;
  }

  let cursor = course.linearCadence.anchorDate;
  const intervalMs = course.linearCadence.intervalDays * MS_PER_DAY;

  for (const lesson of sorted) {
    if (lesson.isExtension) {
      // Extension lessons do not consume a slot; they receive no effective date.
      result.set(lesson.id, undefined);
      continue;
    }

    // An explicit override moves the cursor (cascades to every subsequent lesson).
    if (lesson.releaseDate !== undefined) {
      cursor = lesson.releaseDate;
    }

    result.set(lesson.id, cursor);
    cursor += intervalMs;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. isLessonUnlocked
// ---------------------------------------------------------------------------

/**
 * Returns whether a lesson is currently accessible.
 *
 *  - **Extension lessons** (addendum B): always unlocked regardless of mode.
 *  - `open`: always unlocked.
 *  - `linear`: unlocked when `effectiveDate` is `undefined` (no cadence defined),
 *    or when `effectiveDate <= now`.
 *  - `semi-linear`: unlocked when `lesson.unlockedAt` is set (the one-way
 *    ratchet stored in Phase 6), OR when the lesson is the first core
 *    (non-extension) lesson by `orderIndex`. All other lessons are locked until
 *    their ratchet is triggered.
 *
 * `effectiveDates` is the map returned by `lessonEffectiveReleaseDates`; it is
 * only consulted under `linear` mode. `lessons` must include all lessons in the
 * course so the first-core-lesson check for `semi-linear` is correct.
 */
export function isLessonUnlocked(
  course: Course,
  lesson: Lesson,
  effectiveDates: Map<string, number | undefined>,
  lessons: Lesson[],
  now: number = Date.now(),
): boolean {
  // Extension lessons are always unlocked (addendum B).
  if (lesson.isExtension) return true;

  switch (course.unlockMode) {
    case 'open':
      return true;

    case 'linear': {
      const effectiveDate = effectiveDates.get(lesson.id);
      // Undefined means no cadence was defined — treat as immediately available.
      if (effectiveDate === undefined) return true;
      return effectiveDate <= now;
    }

    case 'semi-linear': {
      // Stored ratchet: once unlocked, never re-locked (addendum I).
      if (lesson.unlockedAt !== undefined) return true;
      // The first core lesson by orderIndex is always available so the student
      // has a starting point even before completing any practice.
      const coreByOrder = [...lessons]
        .filter((l) => !l.isExtension)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      return coreByOrder.length > 0 && coreByOrder[0].id === lesson.id;
    }

    default:
      // Defensive: treat unrecognised future modes as locked.
      return false;
  }
}

// ---------------------------------------------------------------------------
// 3. lessonStatus
// ---------------------------------------------------------------------------

/**
 * Derives the display status of a lesson from its unlock state and card history.
 *
 *  - `locked`: the lesson is not yet unlocked.
 *  - `completed`: unlocked, and every card in the lesson has been served at
 *    least once (FSRS state moved off `New` = 0), regardless of grade.
 *  - `available`: unlocked but not yet completed.
 *
 * A lesson with **zero cards** returns `available`, not `completed` — an empty
 * lesson has nothing to complete.
 *
 * `lessonCards` should contain only the primary-lesson cards for the specific
 * lesson being evaluated. The caller is responsible for filtering.
 */
export function lessonStatus(
  unlocked: boolean,
  lessonCards: Card[],
): LessonStatus {
  if (!unlocked) return 'locked';
  // Zero cards: the lesson has no material yet; show as available.
  if (lessonCards.length === 0) return 'available';
  // A card is 'served' when its FSRS state is no longer New (state !== 0).
  const allServed = lessonCards.every((c) => c.state !== 0);
  return allServed ? 'completed' : 'available';
}

// ---------------------------------------------------------------------------
// 4. buildPath
// ---------------------------------------------------------------------------

/**
 * Assembles the full ordered `PathNode[]` for a course.
 *
 * **Lesson ordering:** all lessons (including extensions) are sorted by
 * `orderIndex`. Extension lessons are included in the path with their status
 * computed correctly (always unlocked per addendum B), but excluded from
 * `pathPosition` totals.
 *
 * **Checkpoint placement (addendum G):** each `CourseExamDate` renders
 * immediately after the lesson with the highest `orderIndex` among its
 * `lessonIds`. When `lessonIds` is absent or empty, the checkpoint follows the
 * last lesson. Checkpoints never gate progression under any unlock mode.
 *
 * `lessonCardsById` is `Map<lessonId, Card[]>` supplied by the caller so this
 * function remains pure and database-free.
 */
export function buildPath(
  course: Course,
  lessons: Lesson[],
  examDates: CourseExamDate[],
  lessonCardsById: Map<string, Card[]>,
  now: number = Date.now(),
): PathNode[] {
  const sorted = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);

  // Map lessonId → orderIndex for fast checkpoint-placement lookups.
  const orderByLessonId = new Map<string, number>(
    sorted.map((l) => [l.id, l.orderIndex]),
  );

  // Build lesson nodes in path order.
  const lessonNodes: LessonPathNode[] = sorted.map((lesson) => {
    const unlocked = isLessonUnlocked(course, lesson, effectiveDates, lessons, now);
    const cards = lessonCardsById.get(lesson.id) ?? [];
    return {
      id: lesson.id,
      nodeType: 'lesson',
      lesson,
      status: lessonStatus(unlocked, cards),
    };
  });

  // Determine the insertion index for each checkpoint.
  interface Placement {
    /** Insert checkpoint immediately after lessonNodes[afterIndex]. */
    afterIndex: number;
    node: CheckpointPathNode;
  }

  const placements: Placement[] = examDates.map((ed) => {
    // Default: after the last lesson.
    let afterIndex = lessonNodes.length - 1;

    if (ed.lessonIds && ed.lessonIds.length > 0) {
      // Find the lesson with the highest orderIndex among the scoped lesson ids.
      let maxOrder = -Infinity;
      for (const lid of ed.lessonIds) {
        const order = orderByLessonId.get(lid);
        if (order !== undefined && order > maxOrder) maxOrder = order;
      }
      if (isFinite(maxOrder)) {
        const idx = lessonNodes.findIndex((n) => n.lesson.orderIndex === maxOrder);
        if (idx >= 0) afterIndex = idx;
      }
    }

    const afterLesson = lessonNodes[afterIndex];
    return {
      afterIndex,
      node: {
        id: ed.id,
        nodeType: 'checkpoint',
        examDate: ed,
        afterLessonId: afterLesson?.lesson.id ?? null,
      },
    };
  });

  // Sort placements so we can weave them in a single forward pass.
  placements.sort((a, b) => a.afterIndex - b.afterIndex);

  // Weave lesson and checkpoint nodes together.
  const result: PathNode[] = [];
  let pi = 0; // placement index

  for (let i = 0; i < lessonNodes.length; i++) {
    result.push(lessonNodes[i]);
    // Insert every checkpoint that follows lessonNodes[i].
    while (pi < placements.length && placements[pi].afterIndex === i) {
      result.push(placements[pi].node);
      pi++;
    }
  }

  // Trailing checkpoints when there are no lessons, or the placement calculation
  // produced an out-of-range afterIndex.
  while (pi < placements.length) {
    result.push(placements[pi].node);
    pi++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. pathPosition
// ---------------------------------------------------------------------------

/**
 * Computes curriculum position for the "Lesson X of N" display (addendum J).
 *
 *  - `total`: count of non-extension lesson nodes.
 *  - `reached`: count of non-extension lesson nodes whose status is `completed`
 *    or `available` (i.e. the student has reached this point in the curriculum).
 *
 * This is purely pacing — it has nothing to do with mastery or FSRS retention.
 * Mastery is a separate metric (`progressValue`) derived from the card pool.
 */
export function pathPosition(nodes: PathNode[]): { reached: number; total: number } {
  let total = 0;
  let reached = 0;

  for (const node of nodes) {
    if (node.nodeType !== 'lesson') continue;
    if (node.lesson.isExtension) continue;
    total++;
    if (node.status === 'completed' || node.status === 'available') reached++;
  }

  return { reached, total };
}
