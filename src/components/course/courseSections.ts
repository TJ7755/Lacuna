// The order of a course's sections, shared by the tab bar, the sliding transition
// between sections and the swipe gesture. All three must agree on what "next
// section" means, so the order lives here rather than in any one of them.

export interface CourseSection {
  label: string;
  /** Shown below sm, where the full set of labels cannot fit on one line. */
  short: string;
  suffix: string;
}

export const COURSE_SECTIONS: CourseSection[] = [
  { label: 'Path', short: 'Path', suffix: '' },
  { label: 'Cards', short: 'Cards', suffix: '/cards' },
  { label: 'Questions', short: 'Questions', suffix: '/questions' },
  { label: 'Analytics', short: 'Analytics', suffix: '/analytics' },
  { label: 'Settings', short: 'Settings', suffix: '/settings' },
];

const COURSE_PATH = /^\/course\/([^/]+)(\/[^/]*)?$/;

/**
 * Identifies an exact course-section route. Deeper routes (a lesson, a card editor)
 * return null: they are destinations within a section rather than siblings of it, and
 * sliding or swiping between them and a sibling section would misrepresent the move.
 */
export function matchCourseSection(pathname: string): { courseId: string; index: number } | null {
  const match = COURSE_PATH.exec(pathname);
  if (!match) return null;
  const [, courseId, rest] = match;
  const suffix = rest ?? '';
  const index = COURSE_SECTIONS.findIndex((section) => section.suffix === suffix);
  return index === -1 ? null : { courseId, index };
}

const COURSE_ROOT = /^\/course\/([^/]+)/;

/** The course a route belongs to, including its deeper pages. Null anywhere else. */
export function courseIdFromPath(pathname: string): string | null {
  return COURSE_ROOT.exec(pathname)?.[1] ?? null;
}

/**
 * Which section should read as current, including from pages nested inside one.
 *
 * Path owns the course root, so it is the fallback rather than a prefix match: every
 * course route starts with Path's (empty) suffix and would otherwise match it first.
 */
export function activeCourseSectionIndex(pathname: string, courseId: string): number {
  const base = `/course/${courseId}`;
  for (let index = COURSE_SECTIONS.length - 1; index >= 1; index -= 1) {
    if (pathname.startsWith(`${base}${COURSE_SECTIONS[index].suffix}`)) return index;
  }
  return 0;
}

export function courseSectionPath(courseId: string, index: number): string | null {
  const section = COURSE_SECTIONS[index];
  if (!section) return null;
  return `/course/${courseId}${section.suffix}`;
}
