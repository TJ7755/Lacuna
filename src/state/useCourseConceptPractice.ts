import { useLiveQuery } from 'dexie-react-hooks';

/** One course read supplies point-level diagnostic evidence without a query for each tree row. */
export function useCourseConceptPractice(courseId: string | undefined) {
  return useLiveQuery(async () => {
    if (!courseId) return [];
    const { listConceptPractice } = await import('../questions/conceptPractice');
    return listConceptPractice(courseId);
  }, [courseId]);
}
