import { localLessonOrderUnavailableReason } from '../course/lessonOrder';
import { stampUpdatedAt } from './mutationStamp';
import { db } from './schema';
import type { Lesson } from './types';
import { earlierCourseLessonIds } from '../course/courseEntry';

export function validateLessonPermutation(lessons: Lesson[], ids: string[]): void {
  const currentIds = new Set(lessons.map((lesson) => lesson.id));
  if (
    ids.length !== lessons.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !currentIds.has(id))
  ) {
    throw new Error(
      'The lesson list changed. Refresh and try again with every current lesson exactly once.',
    );
  }
}

/** Save only the local Course preference; reset is also allowed while suspended. */
export async function setLocalLessonOrder(courseId: string, ids?: string[]): Promise<void> {
  await db.transaction(
    'rw',
    [db.courses, db.lessons, db.courseAssessments, db.practiceNodes],
    async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('Course not found.');
      if (!course.distributedCopy?.locked) {
        throw new Error('Local lesson order requires a locked imported course.');
      }
      const preserveEntry =
        course.schoolCoveredLessonIds === undefined && course.studyStartLessonId;
      if (ids !== undefined || preserveEntry) {
        const [lessons, assessments, practiceNodes] = await Promise.all([
          db.lessons.where('courseId').equals(courseId).toArray(),
          db.courseAssessments.where('courseId').equals(courseId).toArray(),
          db.practiceNodes.where('courseId').equals(courseId).toArray(),
        ]);
        if (ids !== undefined) {
          const reason = localLessonOrderUnavailableReason(
            course,
            lessons,
            assessments,
            practiceNodes,
          );
          if (reason) throw new Error(reason);
          validateLessonPermutation(lessons, ids);
        }
        if (preserveEntry) {
          course.schoolCoveredLessonIds = [
            ...earlierCourseLessonIds(course, lessons, assessments, practiceNodes),
          ];
        }
      }
      await db.courses.update(
        courseId,
        stampUpdatedAt(
          { localLessonOrder: ids, schoolCoveredLessonIds: course.schoolCoveredLessonIds },
          Math.max(Date.now(), course.updatedAt + 1),
        ),
      );
    },
  );
}
