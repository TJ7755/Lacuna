import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  PracticeNode,
  QuestionSetPracticeNode,
} from '@lacuna/core/db/types';
import { shouldInsertPractice } from '../fsrs/practice';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { resolveCourseLessonOrder } from './lessonOrder';
import { courseLessonOrderPreference } from './lessonOrder';
import { lessonIndexAtOrBeforePosition } from './pathPlacement';
import {
  initiallyUnlockedLessonIds,
  isLessonUnlockedWithInitialLessons,
  lessonEffectiveReleaseDates,
} from './pathRules';
import type {
  CheckpointPathNode,
  LessonPathNode,
  LessonStatus,
  PathNode,
  PathProgress,
  PracticePathNode,
  QuestionSetPathNode,
} from './pathTypes';
import { practiceNodeKey } from './studyPools';

const EMPTY_PATH_PROGRESS: PathProgress = {
  exposures: [],
  lessonCompletions: [],
  practiceMilestones: [],
};

/**
 * Assembles the full ordered `PathNode[]` for a course.
 *
 * **Lesson ordering:** supported locked copies use their local traversal preference;
 * other courses follow canonical publisher order. Extension lessons have their status
 * computed correctly (always unlocked per addendum B), but excluded from
 * `pathPosition` totals.
 *
 * **Checkpoint placement:** each checkpoint follows its anchor lesson in the
 * effective course order. Unanchored checkpoints precede all lessons.
 * Checkpoints never gate progression under any unlock mode.
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
 *    `meanReviewSeconds` are a single current-Practice snapshot supplied once per
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
  nearestPracticeAssessmentDate?: number,
): PathNode[] {
  const sorted = resolveCourseLessonOrder(course, lessons, assessments, practiceNodes);
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);

  const initialLessonIds = initiallyUnlockedLessonIds(course, lessons);
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
    const unlocked = isLessonUnlockedWithInitialLessons(
      course,
      lesson,
      effectiveDates,
      initialLessonIds,
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
        : cards.every((card) =>
              course.learnFirst === false ? card.state !== 0 : exposedCardIds?.has(card.id),
            )
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
    node: CheckpointPathNode | PracticePathNode | QuestionSetPathNode;
  }

  const checkpointPlacements: Placement[] = assessments
    .filter((assessment) => assessment.kind === 'checkpoint')
    .map((assessment) => {
      const afterIndex = resolveAssessmentCoverage(
        assessment,
        lessons,
        [],
        [],
        courseLessonOrderPreference(course),
      ).placementIndex;
      return {
        afterIndex,
        node: {
          id: assessment.id,
          nodeType: 'checkpoint',
          assessment,
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

  const questionSetPlacements: Placement[] = practiceNodes
    .filter(
      (node): node is QuestionSetPracticeNode =>
        node.type === 'question-set' && !!node.questionSetIds?.length && !!node.afterLessonId,
    )
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .flatMap((node): Placement[] => {
      const afterIndex = sorted.findIndex((lesson) => lesson.id === node.afterLessonId);
      if (afterIndex < 0 || node.courseId !== course.id) return [];
      return [
        {
          afterIndex,
          node: {
            id: node.id,
            nodeType: 'practice-question-set',
            practiceNode: node,
            questionSetIds: node.questionSetIds,
            afterLessonId: node.afterLessonId,
            nodeKey: node.id,
          },
        },
      ];
    });

  // Auto practice slots (addendum 2 §H): walk the lesson list in path order,
  // evaluating shouldInsertPractice after every lesson against the current
  // reached-and-exposed due-card snapshot. lessonsSinceLastPractice resets at every already-placed
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
            nearestPracticeAssessmentDate,
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
  const placements: Placement[] = [
    ...checkpointPlacements,
    ...manualPlacements,
    ...questionSetPlacements,
    ...autoPlacements,
  ];
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
