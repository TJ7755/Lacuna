import { useEffect, useState } from 'react';
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

/** Feed boundaries from the caller's existing live query, without another card read. */
export function useCourseDataClock() {
  const [boundaries, setBoundaries] = useState<{
    exams: (number | undefined)[];
    burials: (number | null | undefined)[];
  }>({ exams: [], burials: [] });
  const now = useExamClock(boundaries.exams, boundaries.burials);
  return [now, setBoundaries] as const;
}
