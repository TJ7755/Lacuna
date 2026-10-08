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

export function courseSectionPath(courseId: string, index: number): string | null {
  const section = COURSE_SECTIONS[index];
  if (!section) return null;
  return `/course/${courseId}${section.suffix}`;
}

/**
 * Whether a section is the current one on this route. Path must match exactly, or it would
 * stay current on every sibling section; a lesson belongs to the path, so its pages keep
 * Path current. The tab bar and the phone section bar share this so they always agree.
 */
export function isCourseSectionCurrent(
  pathname: string,
  courseId: string,
  suffix: string,
): boolean {
  const to = `/course/${courseId}${suffix}`;
  return suffix === ''
    ? pathname === to || pathname.startsWith(`${to}/lesson/`)
    : pathname === to || pathname.startsWith(`${to}/`);
}
