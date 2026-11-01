import { useLiveQuery } from 'dexie-react-hooks';

/** One scoped read supplies both fresh capacity and diagnostic evidence. */
export function useCourseConceptPractice(
  courseId: string | undefined,
  conceptIds?: readonly string[],
) {
  const scopeKey = conceptIds?.join('\n');
  const value = useLiveQuery(
    async () => ({
      courseId,
      scopeKey,
      items: courseId
        ? await import('../questions/conceptPractice').then(({ listConceptPractice }) =>
            listConceptPractice(
              courseId,
              Date.now(),
              scopeKey === undefined ? undefined : scopeKey ? scopeKey.split('\n') : [],
            ),
          )
        : [],
    }),
    [courseId, scopeKey],
  );
  return value?.courseId === courseId && value?.scopeKey === scopeKey ? value?.items : undefined;
}
