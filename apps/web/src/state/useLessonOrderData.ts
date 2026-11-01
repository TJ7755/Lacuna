import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { localLessonOrderUnavailableReason, resolveCourseLessonOrder } from '../course/lessonOrder';

/** Presentation selection; source-order readers and assessment consumers stay separate. */
export function useLessonOrderData(courseId: string | undefined) {
  return useLiveQuery(async () => {
    if (!courseId) return undefined;
    return db.transaction(
      'r',
      [db.courses, db.lessons, db.courseAssessments, db.practiceNodes],
      async () => {
        const [course, lessons, assessments, practiceNodes] = await Promise.all([
          db.courses.get(courseId),
          db.lessons.where('courseId').equals(courseId).toArray(),
          db.courseAssessments.where('courseId').equals(courseId).toArray(),
          db.practiceNodes.where('courseId').equals(courseId).toArray(),
        ]);
        if (!course) return undefined;
        return {
          course,
          lessons: resolveCourseLessonOrder(course, lessons, assessments, practiceNodes),
          unavailableReason: localLessonOrderUnavailableReason(
            course,
            lessons,
            assessments,
            practiceNodes,
          ),
        };
      },
    );
  }, [courseId]);
}
