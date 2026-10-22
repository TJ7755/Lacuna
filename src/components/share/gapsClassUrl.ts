import type { Course } from '../../db/types';
import { getShareIdForCourse } from '../../shareLinks/linkStore';

/** The course's published share id, falling back to its recorded import link. */
export function shareIdForCourse(course: Course): string | undefined {
  return (
    course.distribution?.shareId ||
    (course.distributedCopy ? getShareIdForCourse(course.id) ?? undefined : undefined)
  );
}

/** Open Gaps with the public course link prefilled when available. */
export function gapsClassUrl(shareId?: string): string {
  const origin = 'https://gaps.getlacuna.app';
  return shareId ? `${origin}/#course=${shareId}` : origin;
}
