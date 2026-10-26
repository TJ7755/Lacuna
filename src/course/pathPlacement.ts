import type { Lesson } from '../db/types';
import { lessonOrder } from './assessmentCoverage';

/** Resolve the publisher-position anchor, returning its index in the supplied lesson order. */
export function lessonIndexAtOrBeforePosition(
  lessons: Lesson[],
  position: number | undefined,
): number {
  if (position === undefined) return -1;
  let result = -1;
  for (let i = 0; i < lessons.length; i++) {
    if (
      lessons[i].orderIndex <= position &&
      (result < 0 || lessonOrder(lessons[result], lessons[i]) < 0)
    )
      result = i;
  }
  return result;
}
