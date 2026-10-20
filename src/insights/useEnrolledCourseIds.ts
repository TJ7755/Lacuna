import { useCallback, useSyncExternalStore } from 'react';
import type { Course } from '../db/types';
import { createEnrolmentSetting } from './enrolment';

type ClassCourse = Pick<Course, 'id' | 'archived' | 'distributedCopy'>;

export function useEnrolledCourseIds(courses: readonly ClassCourse[]): string[] {
  const subscribe = useCallback(
    (refresh: () => void) => {
      const unsubscribe = courses.map((course) =>
        createEnrolmentSetting(course.id).subscribe(refresh),
      );
      return () => unsubscribe.forEach((stop) => stop());
    },
    [courses],
  );
  const read = useCallback(
    () =>
      JSON.stringify(
        courses
          .filter((course) => {
            const enrolment = createEnrolmentSetting(course.id).read();
            return (
              !course.archived &&
              enrolment !== null &&
              enrolment.lineageId === course.distributedCopy?.lineageId
            );
          })
          .map((course) => course.id),
      ),
    [courses],
  );
  // A stable primitive snapshot avoids rerendering navigation when only consent changes.
  return JSON.parse(useSyncExternalStore(subscribe, read)) as string[];
}
