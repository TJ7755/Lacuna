import { stampUpdatedAt } from './mutationStamp';
import { db } from './schema';
import { courseLessonOrderPreference, resolveLessonOrder } from '../course/lessonOrder';
import { earlierLessonIds } from '../course/courseEntry';

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
    const lessons = await db.lessons.where('courseId').equals(courseId).toArray();
    if (lessonId !== undefined) {
      const lesson = lessons.find((candidate) => candidate.id === lessonId);
      if (!lesson || lesson.isExtension) {
        throw new Error('Choose a current core lesson in this course.');
      }
    }
    await db.courses.update(
      courseId,
      stampUpdatedAt(
        {
          studyStartLessonId: lessonId,
          schoolCoveredLessonIds: [
            ...earlierLessonIds(
              lessonId,
              lessons,
              resolveLessonOrder(lessons, courseLessonOrderPreference(course)).map(
                (lesson) => lesson.id,
              ),
            ),
          ],
        },
        Math.max(Date.now(), course.updatedAt + 1),
      ),
    );
  });
}
