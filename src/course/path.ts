// Pure path-logic module for the course path view.
//
// All functions that depend on the current time accept `now: number = Date.now()`
// as their last optional parameter, following the same convention as the FSRS
// modules (see src/fsrs/). No database access; every function takes already-loaded
// data so it can be tested and composed without a live Dexie instance.
//
// British English throughout.

import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCompletion,
  PracticeMilestone,
  PracticeNode,
} from '../db/types';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { MS_PER_DAY } from '../fsrs/params';
import { shouldInsertPractice } from '../fsrs/practice';
import { practiceNodeKey } from './studyPools';

// ---------------------------------------------------------------------------
// Node type registry (addendum K).
// The renderer switches exhaustively over KNOWN_NODE_TYPES for full TypeScript
// safety and falls back to a neutral placeholder for any unknown type — so a
// course exported by a future build with plugin node types still renders.
// ---------------------------------------------------------------------------

/** The set of node types this build knows how to render. */
export const KNOWN_NODE_TYPES = [
  'lesson',
  'checkpoint',
  'practice-auto',
  'practice-manual',
] as const;

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

/** Display state of a lesson node on the path. */
export type LessonStatus = 'completed' | 'available' | 'locked';

/** A lesson rendered as a path node. */
interface LessonPathNode {
  id: string;
  nodeType: 'lesson';
  lesson: Lesson;
  status: LessonStatus;
}

/**
 * A checkpoint assessment rendered as a path node.
 * Checkpoints are informational and never gate progression (addendum G).
 */
interface CheckpointPathNode {
  id: string;
  nodeType: 'checkpoint';
  examDate: CourseAssessment;
  /**
   * ID of the lesson immediately before this checkpoint on the path, or null
   * when the checkpoint follows an empty lesson list.
   */
  afterLessonId: string | null;
}

/**
 * A practice session rendered as a path node (addendum 2 §H).
 *
 *  - `practice-manual`: a teacher-authored `PracticeNode` (type 'manual'), placed
 *    at its own stored `position`. `practiceNode` carries the authored record.
 *  - `practice-auto`: computed fresh on every `buildPath` call from the course's
 *    live due-card count and lessons-since-last-practice; never persisted.
 *    `practiceNode` is undefined — there is no authored configuration, it always
 *    covers the whole course's due cards.
 */
export interface PracticePathNode {
  id: string;
  nodeType: 'practice-auto' | 'practice-manual';
  /** The authored record for `practice-manual` nodes; undefined for `practice-auto`. */
  practiceNode?: PracticeNode;
  /**
   * ID of the lesson immediately before this node on the path, or null when it
   * precedes every lesson (mirrors CheckpointPathNode.afterLessonId).
   */
  afterLessonId: string | null;
  /** Stable persistence identity; auto keys do not depend on insertion sequence. */
  nodeKey: string;
  /** Last persisted milestone measurement, when one exists for this node. */
  milestone?: PracticeMilestone;
}

/** A discriminated union of every path-node view model this build defines. */
export type PathNode = LessonPathNode | CheckpointPathNode | PracticePathNode;

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
  let firstCoreLessonId: string | undefined;
  let firstCoreOrder = Infinity;
  for (const candidate of lessons) {
    if (!candidate.isExtension && candidate.orderIndex < firstCoreOrder) {
      firstCoreOrder = candidate.orderIndex;
      firstCoreLessonId = candidate.id;
    }
  }
  return isLessonUnlockedWithFirstCore(course, lesson, effectiveDates, firstCoreLessonId, now);
}

function isLessonUnlockedWithFirstCore(
  course: Course,
  lesson: Lesson,
  effectiveDates: Map<string, number | undefined>,
  firstCoreLessonId: string | undefined,
  now: number,
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
      return firstCoreLessonId === lesson.id;
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
 * Derives the display status of a lesson from lesson-scoped teaching progress.
 *
 *  - `locked`: the lesson is not yet unlocked.
 *  - `completed`: unlocked, and every member card has an exposure for this
 *    lesson, or a cardless lesson has an explicit completion record.
 *  - `available`: unlocked but not yet completed.
 *
 * `lessonCards` must include both primary cards and explicitly linked cards.
 */
export function lessonStatus(
  unlocked: boolean,
  lessonId: string,
  lessonCards: Card[],
  exposures: LessonCardExposure[],
  completions: LessonCompletion[],
): LessonStatus {
  if (!unlocked) return 'locked';
  if (lessonCards.length === 0) {
    return completions.some((completion) => completion.lessonId === lessonId)
      ? 'completed'
      : 'available';
  }
  const exposedIds = new Set(
    exposures
      .filter((exposure) => exposure.lessonId === lessonId)
      .map((exposure) => exposure.cardId),
  );
  return lessonCards.every((card) => exposedIds.has(card.id)) ? 'completed' : 'available';
}

export interface PathProgress {
  exposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceMilestones: PracticeMilestone[];
}

const EMPTY_PATH_PROGRESS: PathProgress = {
  exposures: [],
  lessonCompletions: [],
  practiceMilestones: [],
};

/**
 * Finds the index, within `sortedLessons` (already sorted ascending by
 * `orderIndex`), of the lesson with the highest `orderIndex <= position` — the
 * "place immediately after this lesson" rule used for manual practice-node
 * placement. Returns -1 when `position` is `undefined` or precedes every
 * lesson. Shared by `buildPath`'s manual-node placement and
 * `practiceGateAfterLesson`, which both apply this exact rule.
 */
function lessonIndexAtOrBeforePosition(
  sortedLessons: Lesson[],
  position: number | undefined,
): number {
  if (position === undefined) return -1;
  let result = -1;
  for (let i = 0; i < sortedLessons.length; i++) {
    if (sortedLessons[i].orderIndex <= position) result = i;
  }
  return result;
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
 * **Checkpoint placement (addendum G):** each checkpoint assessment renders
 * immediately after the lesson with the highest `orderIndex` among its
 * `lessonIds`. When `lessonIds` is absent or empty, the checkpoint follows the
 * last lesson. Checkpoints never gate progression under any unlock mode.
 *
 * `lessonCardsById` is `Map<lessonId, Card[]>` supplied by the caller so this
 * function remains pure and database-free.
 *
 * **Practice placement (addendum 2 §H, §K):**
 *  - `practiceNodes` are the course's stored `PracticeNode` records. Only
 *    `type: 'manual'` ones are placed here — `auto` records are never persisted
 *    (see the `PracticeNode.position` doc comment) and are recomputed below.
 *    A manual node's `position` is compared against lesson `orderIndex`: it is
 *    placed immediately after the lesson with the highest `orderIndex` that is
 *    `<= position` (or before every lesson when `position` is undefined or
 *    lower than the first lesson's `orderIndex`).
 *  - Auto slots are computed by walking the lesson list in path order and
 *    calling `shouldInsertPractice` (from `src/fsrs/practice.ts`) after every
 *    lesson, tracking `lessonsSinceLastPractice` since the previous practice
 *    node (manual or auto) and resetting it whenever one is inserted. This only
 *    runs when `course.autoPractice` is true. `dueCardCount` and
 *    `meanReviewSeconds` are a single course-wide snapshot supplied once per
 *    `buildPath` call, not a live per-lesson figure — the backlog is not
 *    decremented as slots are inserted (that depends on what the learner
 *    actually clears, which this pure function cannot know). Consequently,
 *    once the snapshot's volume trigger (`minutesToClear >= threshold`) fires
 *    for one lesson it would stay true for every lesson after it; the walk
 *    guards against that by suppressing the volume trigger immediately after
 *    an insertion, re-arming it only once `practiceMaxGap` lessons have
 *    elapsed (see `volumeTriggerSuppressed` below), so a sustained backlog
 *    yields periodic practice roughly every `practiceMaxGap` lessons rather
 *    than one after every single lesson.
 */
export function buildPath(
  course: Course,
  lessons: Lesson[],
  assessments: CourseAssessment[],
  lessonCardsById: Map<string, Card[]>,
  practiceNodes: PracticeNode[] = [],
  dueCardCount: number = 0,
  meanReviewSeconds: number = 0,
  now: number = Date.now(),
  progress: PathProgress = EMPTY_PATH_PROGRESS,
): PathNode[] {
  const sorted = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);

  const firstCoreLessonId = sorted.find((lesson) => !lesson.isExtension)?.id;
  const exposedCardIdsByLesson = new Map<string, Set<string>>();
  for (const exposure of progress.exposures) {
    let cardIds = exposedCardIdsByLesson.get(exposure.lessonId);
    if (!cardIds) {
      cardIds = new Set<string>();
      exposedCardIdsByLesson.set(exposure.lessonId, cardIds);
    }
    cardIds.add(exposure.cardId);
  }
  const completedLessonIds = new Set(
    progress.lessonCompletions.map((completion) => completion.lessonId),
  );

  // Build lesson nodes in path order.
  const lessonNodes: LessonPathNode[] = sorted.map((lesson) => {
    const unlocked = isLessonUnlockedWithFirstCore(
      course,
      lesson,
      effectiveDates,
      firstCoreLessonId,
      now,
    );
    const cards = lessonCardsById.get(lesson.id) ?? [];
    const exposedCardIds = exposedCardIdsByLesson.get(lesson.id);
    const status: LessonStatus = !unlocked
      ? 'locked'
      : cards.length === 0
        ? completedLessonIds.has(lesson.id)
          ? 'completed'
          : 'available'
        : cards.every((card) => exposedCardIds?.has(card.id))
          ? 'completed'
          : 'available';
    return {
      id: lesson.id,
      nodeType: 'lesson',
      lesson,
      status,
    };
  });

  // Determine the insertion index for each checkpoint and practice node.
  interface Placement {
    /** Insert the node immediately after lessonNodes[afterIndex] (-1 = before all lessons). */
    afterIndex: number;
    node: CheckpointPathNode | PracticePathNode;
  }

  const checkpointPlacements: Placement[] = assessments
    .filter((assessment) => assessment.kind === 'checkpoint')
    .map((assessment) => {
      const afterIndex = resolveAssessmentCoverage(assessment, sorted, [], []).placementIndex;
      return {
        afterIndex,
        node: {
          id: assessment.id,
          nodeType: 'checkpoint',
          examDate: assessment,
          afterLessonId: afterIndex >= 0 ? sorted[afterIndex].id : null,
        },
      };
    });

  // Manual practice nodes: placed after the highest-orderIndex lesson at or
  // before the node's stored `position`, or before every lesson when `position`
  // is undefined or precedes the first lesson (addendum L §2).
  const manualPlacements: Placement[] = practiceNodes
    .filter((pn) => pn.type === 'manual')
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .map((pn) => {
      const afterIndex = lessonIndexAtOrBeforePosition(sorted, pn.position);
      const afterLesson = lessonNodes[afterIndex];
      const nodeKey = practiceNodeKey(course.id, pn, afterLesson?.lesson.id ?? null);
      return {
        afterIndex,
        node: {
          id: pn.id,
          nodeType: 'practice-manual',
          practiceNode: pn,
          afterLessonId: afterLesson?.lesson.id ?? null,
          nodeKey,
          milestone: progress.practiceMilestones.find((milestone) => milestone.nodeKey === nodeKey),
        },
      };
    });

  // Auto practice slots (addendum 2 §H): walk the lesson list in path order,
  // evaluating shouldInsertPractice after every lesson against the course-wide
  // due-card snapshot. lessonsSinceLastPractice resets at every already-placed
  // manual node and every auto slot this walk inserts.
  //
  // dueCardCount/meanReviewSeconds are a static snapshot for the whole walk, so
  // once the volume trigger (minutesToClear >= threshold) is true it stays true
  // for every subsequent lesson — without a guard this fires an auto slot after
  // every single lesson for the rest of the course whenever the backlog is
  // large. volumeTriggerSuppressed closes that gap: once a slot has been
  // inserted, only the gap backstop (lessonsSinceLastPractice >= practiceMaxGap,
  // already part of shouldInsertPractice) can trigger the next one, until that
  // gap has actually elapsed and the guard re-arms. shouldInsertPractice itself
  // is untouched — this only gates which of its two triggers this call site is
  // allowed to act on.
  const autoPlacements: Placement[] = [];
  if (course.autoPractice) {
    const resetIndices = new Set(manualPlacements.map((p) => p.afterIndex));
    let lessonsSinceLastPractice = 0;
    let volumeTriggerSuppressed = false;
    for (let i = 0; i < lessonNodes.length; i++) {
      lessonsSinceLastPractice++;
      if (resetIndices.has(i)) {
        lessonsSinceLastPractice = 0;
        volumeTriggerSuppressed = false;
        continue;
      }
      const gapElapsed = lessonsSinceLastPractice >= course.practiceMaxGap;
      const insert = volumeTriggerSuppressed
        ? gapElapsed
        : shouldInsertPractice(
            course,
            dueCardCount,
            lessonsSinceLastPractice,
            meanReviewSeconds,
            now,
          );
      if (insert) {
        const afterLessonId = lessonNodes[i].lesson.id;
        const nodeKey = practiceNodeKey(course.id, undefined, afterLessonId);
        autoPlacements.push({
          afterIndex: i,
          node: {
            id: nodeKey,
            nodeType: 'practice-auto',
            afterLessonId,
            nodeKey,
            milestone: progress.practiceMilestones.find(
              (milestone) => milestone.nodeKey === nodeKey,
            ),
          },
        });
        lessonsSinceLastPractice = 0;
        volumeTriggerSuppressed = true;
      }
    }
  }

  // Sort placements so we can weave them in a single forward pass. Checkpoints,
  // manual, then auto placements are pushed in that order for a stable tie-break
  // when multiple nodes share a slot (Array.prototype.sort is stable).
  const placements: Placement[] = [...checkpointPlacements, ...manualPlacements, ...autoPlacements];
  placements.sort((a, b) => a.afterIndex - b.afterIndex);

  // Weave lesson, checkpoint and practice nodes together.
  const result: PathNode[] = [];
  let pi = 0; // placement index

  // Placements with afterIndex -1 precede every lesson.
  while (pi < placements.length && placements[pi].afterIndex < 0) {
    result.push(placements[pi].node);
    pi++;
  }

  for (let i = 0; i < lessonNodes.length; i++) {
    result.push(lessonNodes[i]);
    // Insert every checkpoint/practice node that follows lessonNodes[i].
    while (pi < placements.length && placements[pi].afterIndex === i) {
      result.push(placements[pi].node);
      pi++;
    }
  }

  // Trailing nodes when there are no lessons, or the placement calculation
  // produced an out-of-range afterIndex.
  while (pi < placements.length) {
    result.push(placements[pi].node);
    pi++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. practiceGateAfterLesson
// ---------------------------------------------------------------------------

/**
 * Whether a practice node gates the path slot immediately after `lessonId`, for
 * the semi-linear unlock ratchet (addendum 2 §I; see `unlock.ts`'s
 * `nextLessonUnlockCondition`).
 *
 * Only **manual** practice nodes gate the ratchet. Auto nodes are deliberately
 * excluded: they are advisory, recomputed on every `buildPath` call from a
 * volatile due-card/mean-review-seconds snapshot (see `buildPath`'s doc
 * comment), so whether one "exists" in a given slot can change from one
 * render to the next as the backlog is cleared or grows. Gating a one-way
 * unlock ratchet on a signal that flickers would make the dual gate
 * unpredictable — a lesson could appear to need practice on one check and not
 * the next, depending on unrelated review activity elsewhere in the course.
 * Manual nodes are teacher-authored and stable, so they are the only sound
 * gate for this decision.
 *
 * This intentionally mirrors only the manual-placement half of `buildPath`
 * (same "highest orderIndex `<=` position" rule) rather than calling the full
 * function, so call sites that only have a lesson list and the course's
 * practice nodes to hand — not the card and due-count data `buildPath`
 * requires — can still evaluate the gate.
 */
export function practiceGateAfterLesson(
  lessons: Lesson[],
  practiceNodes: PracticeNode[],
  lessonId: string,
  activeNodeKeys?: ReadonlySet<string>,
): boolean {
  return manualPracticeGateKeysAfterLesson(lessons, practiceNodes, lessonId).some(
    (nodeKey) => activeNodeKeys === undefined || activeNodeKeys.has(nodeKey),
  );
}

/** Stable identities of the manual Practice nodes placed directly after a lesson. */
export function manualPracticeGateKeysAfterLesson(
  lessons: Lesson[],
  practiceNodes: PracticeNode[],
  lessonId: string,
): string[] {
  const sorted = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);
  if (!sorted.some((l) => l.id === lessonId)) return [];

  const result: string[] = [];
  const manualNodes = practiceNodes
    .filter((pn) => pn.type === 'manual')
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  for (const pn of manualNodes) {
    if (pn.position === undefined) continue;
    const afterIndex = lessonIndexAtOrBeforePosition(sorted, pn.position);
    if (afterIndex >= 0 && sorted[afterIndex].id === lessonId) result.push(pn.id);
  }
  return result;
}

/**
 * Result for the semi-linear gate after one lesson. `undefined` means there is
 * no active manual gate; otherwise every active node in the slot must have a
 * completed milestone. This prevents completing one Practice node from
 * satisfying unrelated checkpoints elsewhere in the course.
 */
export function manualPracticeGateOutcomeAfterLesson(
  lessons: Lesson[],
  practiceNodes: PracticeNode[],
  lessonId: string,
  activeNodeKeys: ReadonlySet<string>,
  completedNodeKeys: ReadonlySet<string>,
): boolean | undefined {
  const activeGateKeys = manualPracticeGateKeysAfterLesson(lessons, practiceNodes, lessonId).filter(
    (nodeKey) => activeNodeKeys.has(nodeKey),
  );
  if (activeGateKeys.length === 0) return undefined;
  return activeGateKeys.every((nodeKey) => completedNodeKeys.has(nodeKey));
}

// ---------------------------------------------------------------------------
// 6. pathPosition
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

/**
 * Nearest upcoming exam date for a course: considers `course.examDate` and all
 * explicit checkpoint assessments, and returns the soonest one still in
 * the future. Falls back to `course.examDate` even if it has already passed,
 * so the header always has something to show. Shared by CoursePath and
 * LessonView so both headers agree on "the" exam date.
 */
export function nearestExamDate(
  course: Course,
  assessments: CourseAssessment[],
  now: number = Date.now(),
): number {
  const futureDates = [
    course.examDate,
    ...assessments
      .filter((assessment) => assessment.kind === 'checkpoint')
      .map((assessment) => assessment.examDate),
  ].filter((d) => d > now);
  return futureDates.length > 0 ? Math.min(...futureDates) : course.examDate;
}

/** An exam within this many days is flagged as urgent (pulsing header marker). */
export const EXAM_URGENT_DAYS = 3;

/**
 * Whether `nearestExam` (as returned by `nearestExamDate`) is both still
 * upcoming and within `EXAM_URGENT_DAYS` of `now`. Shared by CoursePath and
 * LessonView so both headers agree on when to flag urgency.
 */
export function examIsUrgent(nearestExam: number, now: number = Date.now()): boolean {
  return nearestExam > now && nearestExam - now <= EXAM_URGENT_DAYS * MS_PER_DAY;
}
