import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { isUpcomingExamDate } from '../fsrs/examDate';

/** Refresh derived figures only when a time-dependent boundary changes. */
export function useExamClock(
  dates: readonly (number | undefined)[],
  burialExpiries: readonly (number | null | undefined)[] = [],
): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Date.now();
    const midnight = new Date(current);
    midnight.setHours(24, 0, 0, 0);
    let next = midnight.getTime();
    for (const date of dates) {
      if (isUpcomingExamDate(date, current)) next = Math.min(next, date);
    }
    for (const expiry of burialExpiries) {
      if (expiry !== null && expiry !== undefined && expiry > current)
        next = Math.min(next, expiry);
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, next - current));
    return () => clearTimeout(timer);
  }, [dates, burialExpiries, now]);
  return now;
}

export function useCourseDataClock(): number {
  const dates = useLiveQuery(async () => {
    const [lessons, assessments, cards] = await Promise.all([
      db.lessons.toArray(),
      db.courseAssessments.toArray(),
      db.cards.toArray(),
    ]);
    return {
      exams: [...lessons, ...assessments].map((row) => row.examDate),
      burials: cards.map((card) => card.buriedUntil),
    };
  }, []);
  return useExamClock(dates?.exams ?? [], dates?.burials ?? []);
}
