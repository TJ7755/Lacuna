import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { isUpcomingExamDate } from '../fsrs/examDate';

/** Refresh derived figures at deadlines and while the database is idle. */
export function useExamClock(dates: readonly (number | undefined)[]): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Date.now();
    const next = Math.min(
      current + 60_000,
      ...dates.filter((date) => isUpcomingExamDate(date, current)),
    );
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, next - current));
    return () => clearTimeout(timer);
  }, [dates, now]);
  return now;
}

export function useCourseDataClock(): number {
  const dates = useLiveQuery(async () => {
    const [courses, lessons, assessments] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.courseAssessments.toArray(),
    ]);
    return [...courses, ...lessons, ...assessments].map((row) => row.examDate);
  }, []);
  return useExamClock(dates ?? []);
}
