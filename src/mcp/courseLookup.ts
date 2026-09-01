import type { Course } from '../db/types';
import * as read from '../db/read';

function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export async function findCourseMatches(query: string): Promise<Course[]> {
  const courses = await read.listCourses();
  const exactId = courses.find((course) => course.id === query);
  if (exactId) return [exactId];

  const wanted = normalise(query);
  const exactNames = courses.filter((course) => normalise(course.name) === wanted);
  if (exactNames.length > 0) return exactNames;

  return courses
    .filter((course) => normalise(course.name).includes(wanted))
    .sort((left, right) => {
      const leftName = normalise(left.name);
      const rightName = normalise(right.name);
      const prefix = Number(rightName.startsWith(wanted)) - Number(leftName.startsWith(wanted));
      return prefix || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    });
}

export function courseChoiceMessage(query: string, courses: readonly Course[]): string {
  if (courses.length === 0) return `No Course matched "${query}".`;
  const choices = courses
    .slice(0, 5)
    .map((course) => `"${course.name}" (${course.id})`)
    .join(', ');
  return `More than one Course matched "${query}": ${choices}. Use the exact name or Course id.`;
}
