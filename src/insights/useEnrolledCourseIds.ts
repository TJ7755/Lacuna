import { useEffect, useState } from 'react';
import type { Course } from '../db/types';
import { createLocalSetting } from '../state/localSetting';
import { enrolmentStorageOptions } from './enrolmentStorage';

type ClassCourse = Pick<Course, 'id' | 'archived' | 'distributedCopy'>;

export function useEnrolledCourseIds(courses: readonly ClassCourse[]): string[] {
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const settings = courses.map((course) =>
      createLocalSetting({
        ...enrolmentStorageOptions(course.id),
        parse: (raw) => raw,
      }),
    );
    async function refresh() {
      if (!settings.some((setting) => setting.read() !== null)) {
        if (active) setEnrolledIds([]);
        return;
      }
      // Ordinary learner startup does not need the enrolment schema or reporting code.
      const { createEnrolmentSetting } = await import('./enrolment');
      if (!active) return;
      const ids = courses
        .filter((course) => {
          const enrolment = createEnrolmentSetting(course.id).read();
          return (
            !course.archived &&
            enrolment !== null &&
            enrolment.lineageId === course.distributedCopy?.lineageId
          );
        })
        .map((course) => course.id);
      setEnrolledIds((previous) =>
        previous.length === ids.length && previous.every((id, index) => id === ids[index])
          ? previous
          : ids,
      );
    }
    const changed = () => {
      void refresh().catch(() => {
        // The rest of navigation stays usable if the optional module cannot load.
        if (active) setEnrolledIds([]);
      });
    };
    const unsubscribe = settings.map((setting) => setting.subscribe(changed));
    changed();
    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
    };
  }, [courses]);
  return enrolledIds;
}
