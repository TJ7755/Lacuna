import type { Transaction } from 'dexie';
import { emptyPerformance, updatePerformance } from '../fsrs/grading';
import type { Card, SchedulingPerformance, SchedulingUnitRecord, UserPerformance } from './types';
import { db } from './schema';
import { schedulingUnitFromCourse, schedulingUnitFromLesson } from './schedulingUnitBuilder';
import { stampUpdatedAt, recordTombstone, recordTombstones } from './mutationStamp';

function schedulingUnitMeaningfullyChanged(
  previous: SchedulingUnitRecord,
  next: Omit<SchedulingUnitRecord, 'updatedAt'> & { updatedAt?: number },
): boolean {
  const keys = new Set<string>([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === 'updatedAt') continue;
    const left = previous[key as keyof SchedulingUnitRecord];
    const right = next[key as keyof SchedulingUnitRecord];
    if (Object.is(left, right) || (left == null && right == null)) continue;
    if (
      typeof left === 'object' &&
      left !== null &&
      typeof right === 'object' &&
      right !== null &&
      JSON.stringify(left) === JSON.stringify(right)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

const emptyStats = () => ({
  runningMeanResponseTime: 0,
  runningStdDevResponseTime: 0,
  m2: 0,
  totalCorrectReviews: 0,
});

function asLegacyPerformance(
  id: string,
  row: Pick<UserPerformance, 'runningMeanResponseTime' | 'runningStdDevResponseTime' | 'm2' | 'totalCorrectReviews'>,
  courseId?: string,
): UserPerformance {
  return { deckId: id, ...(courseId ? { courseId } : {}), ...row };
}

export async function getSchedulingUnit(
  courseId: string,
  lessonId: string | null = null,
): Promise<SchedulingUnitRecord | undefined> {
  const unit = await db.schedulingUnits.get(lessonId ?? courseId);
  return unit?.courseId === courseId && (unit.lessonId ?? null) === lessonId ? unit : undefined;
}

export async function performanceForCourseBackingDecks(
  courseId: string,
  cards: Card[],
): Promise<UserPerformance[]> {
  const ids = [...new Set(cards
    .filter((card) => card.courseId === courseId)
    .map((card) => card.schedulingUnitId)
    .filter((id): id is string => !!id))];
  const rows = await db.schedulingPerformance.bulkGet(ids);
  return rows.flatMap((row, index) => row ? [asLegacyPerformance(ids[index], row, row.courseId)] : []);
}

type ReviewPerformanceUnitKind = 'scheduling-unit' | 'course';

export function performanceForReviewUnits(
  ids: readonly string[],
  kind?: ReviewPerformanceUnitKind,
): Promise<Array<UserPerformance | undefined>> {
  return Promise.all(ids.map((id) => performanceForReviewUnit(id, kind)));
}

export async function performanceForReviewUnit(
  id: string,
  kind: ReviewPerformanceUnitKind = 'scheduling-unit',
): Promise<UserPerformance | undefined> {
  if (kind === 'course') {
    const row = await db.coursePerformance.get(id);
    return row ? asLegacyPerformance(id, row, id) : undefined;
  }
  const row = await db.schedulingPerformance.get(id);
  return row ? asLegacyPerformance(id, row, row.courseId) : undefined;
}

export async function updateReviewUnitPerformance(
  id: string,
  responseTimeSec: number,
  kind: ReviewPerformanceUnitKind = 'scheduling-unit',
): Promise<UserPerformance> {
  const next = updatePerformance((await performanceForReviewUnit(id, kind)) ?? emptyPerformance(id), responseTimeSec);
  if (kind === 'course') {
    await db.coursePerformance.put(stampUpdatedAt({ courseId: id, ...next }));
    return { ...next, courseId: id };
  }
  const unit = await db.schedulingUnits.get(id);
  await db.schedulingPerformance.put(stampUpdatedAt({
    schedulingUnitId: id,
    ...(unit?.courseId ? { courseId: unit.courseId } : {}),
    ...(unit?.lessonId ? { lessonId: unit.lessonId } : {}),
    ...next,
  }));
  return next;
}

export async function restoreReviewUnitPerformance(
  id: string,
  previous: UserPerformance | null,
  kind: ReviewPerformanceUnitKind = 'scheduling-unit',
): Promise<void> {
  // Undo of a review, not a user delete: restore the prior row unchanged and
  // do not tombstone a null previous (that is the undo of the first review).
  if (kind === 'course') {
    if (previous) await db.coursePerformance.put({ courseId: id, ...previous });
    else await db.coursePerformance.delete(id);
    return;
  }
  if (!previous) {
    await db.schedulingPerformance.delete(id);
    return;
  }
  const unit = await db.schedulingUnits.get(id);
  await db.schedulingPerformance.put({
    schedulingUnitId: id,
    ...(unit?.courseId ? { courseId: unit.courseId } : {}),
    ...(unit?.lessonId ? { lessonId: unit.lessonId } : {}),
    ...previous,
  });
}

export function findBackingDeck(courseId: string, lessonId: string | null) {
  return getSchedulingUnit(courseId, lessonId);
}

export async function findBackingDecks(
  courseId: string,
  lessonIds: readonly string[],
): Promise<Map<string | null, SchedulingUnitRecord>> {
  const units = await db.schedulingUnits.bulkGet([courseId, ...lessonIds]);
  const result = new Map<string | null, SchedulingUnitRecord>();
  for (const unit of units) if (unit?.courseId === courseId) result.set(unit.lessonId ?? null, unit);
  return result;
}

export function ensureLessonBackingDeck(courseId: string, lessonId: string): Promise<string> {
  return ensureUnit(courseId, lessonId);
}

export function ensureCourseBankBackingDeck(courseId: string): Promise<string> {
  return ensureUnit(courseId, null);
}

async function ensureUnit(courseId: string, lessonId: string | null): Promise<string> {
  if (!(await getSchedulingUnit(courseId, lessonId))) await syncCourseSchedulingUnits(courseId);
  const id = lessonId ?? courseId;
  if (!(await getSchedulingUnit(courseId, lessonId))) throw new Error('Scheduling unit could not be resolved.');
  return id;
}

export async function syncCourseSchedulingUnits(courseId: string): Promise<void> {
  const [course, lessons, assessments] = await Promise.all([
    db.courses.get(courseId),
    db.lessons.where('courseId').equals(courseId).toArray(),
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
  ]);
  if (!course) return;
  const units = [
    schedulingUnitFromCourse(course, assessments),
    ...lessons.map((lesson) => schedulingUnitFromLesson(course, lesson, assessments)),
  ];
  const existing = await db.schedulingUnits.bulkGet(units.map((unit) => unit.id));
  const now = Date.now();
  await db.schedulingUnits.bulkPut(units.map((unit, index) => {
    const previous = existing[index];
    const next = {
      ...unit,
      ...(previous?.lastInteractedAt !== undefined
        ? { lastInteractedAt: previous.lastInteractedAt }
        : {}),
    };
    if (!previous) return stampUpdatedAt(next, now);
    if (
      typeof previous.updatedAt === 'number' &&
      !schedulingUnitMeaningfullyChanged(previous, next)
    ) {
      return { ...next, updatedAt: previous.updatedAt };
    }
    return stampUpdatedAt(next, now);
  }));
  if (!(await db.coursePerformance.get(courseId))) {
    await db.coursePerformance.put(stampUpdatedAt({ courseId, ...emptyStats() }, now));
  }
  const performance = await db.schedulingPerformance.bulkGet(units.map((unit) => unit.id));
  const missing: SchedulingPerformance[] = units.flatMap((unit, index) => performance[index] ? [] : [stampUpdatedAt({
    schedulingUnitId: unit.id,
    ...(unit.courseId ? { courseId: unit.courseId } : {}),
    ...(unit.lessonId ? { lessonId: unit.lessonId } : {}),
    ...emptyStats(),
  }, now)]);
  if (missing.length > 0) await db.schedulingPerformance.bulkPut(missing);
}

export async function removeLessonSchedulingUnit(
  lessonId: string,
  tx?: Transaction,
): Promise<void> {
  // Tombstones are recorded only when the caller passes its open transaction.
  // deleteCourse / deleteLesson record them at the call site otherwise.
  if (tx) {
    await recordTombstone(tx, 'schedulingUnits', lessonId);
    await recordTombstone(tx, 'schedulingPerformance', lessonId);
  }
  await db.schedulingUnits.delete(lessonId);
  await db.schedulingPerformance.delete(lessonId);
}

export async function removeCourseSchedulingUnits(
  courseId: string,
  lessonIds: readonly string[],
  tx?: Transaction,
): Promise<void> {
  // Tombstones are recorded only when the caller passes its open transaction.
  // deleteCourse / deleteLesson record them at the call site otherwise.
  const ids = [courseId, ...lessonIds];
  if (tx) {
    await recordTombstones(tx, 'schedulingUnits', ids);
    await recordTombstone(tx, 'coursePerformance', courseId);
    await recordTombstones(tx, 'schedulingPerformance', ids);
  }
  await db.schedulingUnits.bulkDelete(ids);
  await db.coursePerformance.delete(courseId);
  await db.schedulingPerformance.bulkDelete(ids);
}
