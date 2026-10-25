import type { Lesson } from '../db/types';

/**
 * Finds the index, within `sortedLessons` (already sorted ascending by
 * `orderIndex`), of the lesson with the highest `orderIndex <= position` — the
 * "place immediately after this lesson" rule used for manual practice-node
 * placement. Returns -1 when `position` is `undefined` or precedes every
 * lesson. Shared by `buildPath`'s manual-node placement and
 * `practiceGateAfterLesson`, which both apply this exact rule.
 */
export function lessonIndexAtOrBeforePosition(
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
