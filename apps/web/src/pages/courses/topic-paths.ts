import type { LibraryCourse } from '../../library/catalogue.ts';

export function topicSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error('A topic slug must contain letters or numbers.');
  return slug;
}

export function courseBoardPath(course: LibraryCourse): string {
  return `/courses/${topicSlug(course.board)}/`;
}

export function courseSubjectPath(course: LibraryCourse): string {
  return `${courseBoardPath(course)}${topicSlug(`${course.qualification}-${course.subject}-${course.code}`)}/`;
}

export function courseTopicPath(course: LibraryCourse, topicId: string): string {
  return `${courseSubjectPath(course)}${topicSlug(topicId)}/`;
}
