import { courseCodes, libraryCourses, type LibraryCourse } from '../../library/catalogue.ts';

export const coursePaths = ['/courses/', ...libraryCourses.map(({ id }) => `/courses/${id}/`)];

export function courseForPath(path: string): LibraryCourse | undefined {
  return libraryCourses.find(({ id }) => path === `/courses/${id}/`);
}

export function courseMetadata(course?: LibraryCourse) {
  const name = course ? `${course.subject} ${courseCodes(course)}` : 'Free GCSE and IGCSE revision courses';
  const title = course ? `${name} revision — ${course.qualification}` : name;
  const subjects = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
    [...new Set(libraryCourses.map(({ subject }) => subject))],
  );
  const description = course
    ? course.stats
      ? `Free ${course.qualification} ${course.subject} (${courseCodes(course)}) revision course: ${course.stats.cards.toLocaleString('en-GB')} flashcards, ${course.stats.notes.toLocaleString('en-GB')} notes and ${course.stats.practiceSets.toLocaleString('en-GB')} exam-style practice sets, planned to your exam date.`
      : `Free ${course.qualification} ${course.subject} (${courseCodes(course)}) revision course with flashcards, notes and exam-style practice, planned to your exam date.`
    : `Free GCSE and IGCSE revision courses for ${subjects}, with flashcards, notes and exam-style practice planned to your exam date.`;
  return {
    title: `${title} | Lacuna`,
    ogTitle: title,
    description,
    canonical: `https://getlacuna.app/courses/${course ? `${course.id}/` : ''}`,
  };
}
