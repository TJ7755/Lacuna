import type { Lesson } from './types';

type PrerequisiteLesson = Pick<Lesson, 'id' | 'courseId' | 'prerequisiteLessonIds'>;

/** Advisory content links only: path position, access and scheduling are independent. */
export function assertLessonPrerequisites(lessons: readonly PrerequisiteLesson[]): void {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  if (byId.size !== lessons.length) throw new Error('Duplicate Lesson prerequisite identity.');
  const dependants = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  for (const lesson of lessons) {
    const ids = lesson.prerequisiteLessonIds ?? [];
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
      throw new Error(`Lesson ${lesson.id}: duplicate or invalid prerequisites.`);
    }
    remaining.set(lesson.id, ids.length);
    for (const id of ids) {
      if (id === lesson.id) throw new Error(`Lesson ${lesson.id}: self prerequisite.`);
      const target = byId.get(id);
      if (!target || target.courseId !== lesson.courseId) {
        throw new Error(`Lesson ${lesson.id}: prerequisite ${id} must exist in the same Course.`);
      }
      const group = dependants.get(id) ?? [];
      group.push(lesson.id);
      dependants.set(id, group);
    }
  }
  const ready = lessons
    .filter((lesson) => remaining.get(lesson.id) === 0)
    .map((lesson) => lesson.id);
  for (let index = 0; index < ready.length; index++) {
    for (const id of dependants.get(ready[index]) ?? []) {
      const count = remaining.get(id)! - 1;
      remaining.set(id, count);
      if (count === 0) ready.push(id);
    }
  }
  if (ready.length !== lessons.length) throw new Error('Lesson prerequisites contain a cycle.');
}

export function assertShareLessonPrerequisites(
  lessons: readonly { i?: string; pr?: string[] }[],
): void {
  const hasLinks = lessons.some((lesson) => lesson.pr?.length);
  if (hasLinks && lessons.some((lesson) => !lesson.i)) {
    throw new Error('Shared Lesson prerequisites require stable Lesson ids.');
  }
  assertLessonPrerequisites(
    lessons
      .filter((lesson) => lesson.i !== undefined)
      .map((lesson) => ({
        id: lesson.i!,
        courseId: 'shared-course',
        prerequisiteLessonIds: lesson.pr,
      })),
  );
}
