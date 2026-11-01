import type { Lesson, PracticeNode } from '@lacuna/core/db/types';
import { lessonOrder } from './assessmentCoverage';
import { lessonIndexAtOrBeforePosition } from './pathPlacement';

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
  const sorted = [...lessons].sort(lessonOrder);
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
