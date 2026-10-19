import { stampUpdatedAt } from './mutationStamp';
import { db } from './schema';

/** Entry preferences never rewrite content, scheduling evidence or publisher locks. */
export async function setCourseStudyStartLesson(
  courseId: string,
  lessonId?: string,
): Promise<void> {
  await db.transaction('rw', [db.courses, db.lessons], async () => {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('The course could not be found.');
    if (course.archived)
      throw new Error('Restore this course before changing its starting lesson.');
    if (lessonId !== undefined) {
      const lesson = await db.lessons.get(lessonId);
      if (!lesson || lesson.courseId !== courseId || lesson.isExtension) {
        throw new Error('Choose a current core lesson in this course.');
      }
    }
    await db.courses.update(
      courseId,
      stampUpdatedAt({ studyStartLessonId: lessonId }, Math.max(Date.now(), course.updatedAt + 1)),
    );
  });
}
