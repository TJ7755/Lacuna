import { assertLessonPrerequisites } from '@lacuna/core/db/lessonPrerequisites';

export { assertLessonPrerequisites } from '@lacuna/core/db/lessonPrerequisites';

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
