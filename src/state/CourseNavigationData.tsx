import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type { Course } from '../db/types';

const CourseNavigationContext = createContext<Course[] | undefined | null>(null);

/** Lightweight identity/permissions stay available across tabs, independently of forecasts. */
export function CourseNavigationDataProvider({ children }: { children: ReactNode }) {
  const courses = useLiveQuery(async () => {
    const [records, assessments] = await db.transaction(
      'r',
      [db.courses, db.courseAssessments],
      () => Promise.all([db.courses.toArray(), db.courseAssessments.toArray()]),
    );
    return records.map((record) =>
      hydrateCourse(record, finalAssessmentForCourse(record.id, assessments)),
    );
  }, []);
  return (
    <CourseNavigationContext.Provider value={courses}>{children}</CourseNavigationContext.Provider>
  );
}

export function useNavigationCourses() {
  return useContext(CourseNavigationContext);
}
