import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AssessmentSpecificationContext } from '../course/assessmentCoverage';
import { db } from '../db/schema';

export function useAssessmentSpecification(courseId: string): AssessmentSpecificationContext {
  const course = useLiveQuery(() => db.courses.get(courseId), [courseId]);
  const hasData = course?.specificationData !== undefined;
  const concepts = useLiveQuery(
    () => (hasData ? db.concepts.where('courseId').equals(courseId).toArray() : []),
    [courseId, hasData],
  );
  return useMemo(() => ({ course, concepts }), [course, concepts]);
}
