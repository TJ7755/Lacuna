import type { LineagePayload } from './lineageImportModel';
import { jsonValuesEqual } from '@lacuna/core/db/lineageDiff';
import type { CourseDistributedCopy, CourseRecord } from '@lacuna/core/db/types';

/** The teacher's course details as first import writes them. */
export function courseSource(
  payload: LineagePayload,
): NonNullable<CourseDistributedCopy['source']> {
  return {
    name: payload.course.n || 'Shared course',
    description: payload.course.d ?? '',
    creator: payload.by ?? undefined,
    unlockMode: payload.course.um,
    ...(payload.course.specificationRef === undefined
      ? {}
      : { specificationRef: payload.course.specificationRef }),
    ...(payload.course.specificationData === undefined
      ? {}
      : { specificationData: payload.course.specificationData }),
    ...(payload.course.examBoard === undefined ? {} : { examBoard: payload.course.examBoard }),
    ...(payload.course.specification === undefined
      ? {}
      : { specification: payload.course.specification }),
  };
}

/** Keep learner overrides; inherit teacher changes only while a detail matches its source. */
export function courseDetailChanges(
  course: CourseRecord,
  source: NonNullable<CourseDistributedCopy['source']>,
): Partial<CourseRecord> {
  const previousSource = course.distributedCopy?.source;
  const detailChanges: Partial<CourseRecord> = {};
  const local = {
    name: course.name,
    description: course.description ?? '',
    unlockMode: course.unlockMode,
    creator: course.creator,
    specificationRef: course.specificationRef,
    specificationData: course.specificationData,
    examBoard: course.examBoard,
    specification: course.specification,
  };
  for (const key of [
    'name',
    'description',
    'unlockMode',
    'creator',
    'specificationRef',
    'specificationData',
    'examBoard',
    'specification',
  ] as const) {
    if (
      !jsonValuesEqual(local[key], source[key]) &&
      (!previousSource || jsonValuesEqual(local[key], previousSource[key]))
    ) {
      Object.assign(detailChanges, { [key]: source[key] });
    }
  }
  return detailChanges;
}
