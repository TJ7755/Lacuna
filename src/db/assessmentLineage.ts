import { db } from './schema';
import type { SharePayloadV4, SharePayloadV5 } from './share';
import type { CourseAssessment, LineageIdMapping } from './types';
import { validateAssessmentStructure } from './assessmentRepository';

type Payload = (SharePayloadV4 | SharePayloadV5) & { li: string; rv: number };
type Snapshot = Omit<CourseAssessment, 'updatedAt'>;

function snapshot(record: CourseAssessment): Snapshot {
  const { updatedAt: _updatedAt, ...content } = record;
  return content;
}

function unchanged(record: CourseAssessment, expected: Snapshot | undefined): boolean {
  return expected !== undefined && JSON.stringify(snapshot(record)) === JSON.stringify(expected);
}

/** Adopt published assessment identities before Question Set references are checked. */
export async function applyLineageAssessments(
  payload: Payload,
  courseId: string,
  mapping: LineageIdMapping,
  firstImport = false,
): Promise<void> {
  const exams = payload.exams ?? [];
  if (exams.length === 0 && (mapping.assessmentIds?.length ?? 0) === 0) return;
  if (exams.some((exam) => !exam.id || !exam.k)) {
    throw new Error('A published Assessment is missing its originating ID or kind.');
  }
  if (exams.filter((exam) => exam.k === 'f').length !== 1) {
    throw new Error('A published Course must have exactly one final Assessment.');
  }
  const incomingIds = new Set(exams.map((exam) => exam.id!));
  if (incomingIds.size !== exams.length) throw new Error('Duplicate published Assessment ID.');
  const previousIds = new Set(mapping.assessmentIds ?? []);
  const previousSnapshots = mapping.assessmentSnapshots ?? {};
  const existingForCourse = await db.courseAssessments.where('courseId').equals(courseId).toArray();

  // createCourse supplies a default final assessment. Replace it only on the first
  // full published assessment import, before any learner-owned assessment exists.
  if (firstImport && exams.length > 0) {
    for (const local of existingForCourse) {
      if (!incomingIds.has(local.id)) await db.courseAssessments.delete(local.id);
    }
  }
  if (
    !firstImport &&
    previousIds.size === 0 &&
    exams.length > 0 &&
    existingForCourse.some((local) => !incomingIds.has(local.id))
  ) {
    throw new Error('An existing local Assessment conflicts with this published update.');
  }

  for (const id of previousIds) {
    if (incomingIds.has(id)) continue;
    const existing = await db.courseAssessments.get(id);
    if (existing && !unchanged(existing, previousSnapshots[id])) {
      throw new Error('A locally edited Assessment conflicts with this published update.');
    }
    if (existing) {
      await db.courseAssessments.delete(id);
      await db.tombstones.put({
        table: 'courseAssessments',
        recordId: id,
        deletedAt: Math.max(payload.at, existing.updatedAt + 1),
      });
    }
  }

  const lessons = payload.lessons.map((lesson) => lesson.i);
  const cards = new Set(payload.lessons.flatMap((lesson) => lesson.cards.map((card) => card.id)));
  const snapshots: Record<string, Snapshot> = {};
  for (const exam of exams) {
    const id = exam.id!;
    const existing = await db.courseAssessments.get(id);
    const tombstone = await db.tombstones.get(['courseAssessments', id]);
    if (existing && existing.courseId !== courseId) {
      throw new Error(`A published Assessment ID belongs to another Course: ${id}.`);
    }
    if (previousIds.has(id) && !existing) {
      throw new Error('A locally deleted Assessment conflicts with this published update.');
    }
    if (existing && (!previousIds.has(id) || !unchanged(existing, previousSnapshots[id]))) {
      throw new Error('A locally edited Assessment conflicts with this published update.');
    }
    if (exam.a !== null && exam.a !== undefined && !lessons[exam.a]) {
      throw new Error('A published Assessment references a missing Lesson.');
    }
    if ((exam.ls ?? []).some((index) => !lessons[index])) {
      throw new Error('A published Assessment references a missing Lesson.');
    }
    if ((exam.x ?? []).some((cardId) => !cards.has(cardId))) {
      throw new Error('A published Assessment references a missing Card.');
    }
    const common = {
      id,
      courseId,
      name: exam.n || 'Exam',
      kind: exam.k === 'f' ? ('final' as const) : ('checkpoint' as const),
      ...(exam.e === undefined ? {} : { examDate: exam.e }),
      ...(exam.sm === 1 ? { schedulingMode: 'steady' as const } : {}),
      ...(exam.tz ? { timeZone: exam.tz } : {}),
      afterLessonId: exam.a === null || exam.a === undefined ? null : lessons[exam.a]!,
      excludedCardIds: exam.x ?? [],
      ...(exam.ac ? { needsAuthorConfirmation: true } : {}),
      createdAt: existing?.createdAt ?? exam.c ?? payload.at,
      updatedAt: Math.max(
        existing?.updatedAt ?? payload.at,
        payload.at,
        (tombstone?.deletedAt ?? -1) + 1,
      ),
    };
    const record: CourseAssessment =
      exam.m === 'c'
        ? {
            ...common,
            coverageMode: 'custom',
            lessonIds: (exam.ls ?? []).map((index) => lessons[index]!),
          }
        : { ...common, coverageMode: 'prefix' };
    validateAssessmentStructure(record);
    await db.courseAssessments.put(record);
    if (tombstone) await db.tombstones.delete(['courseAssessments', id]);
    snapshots[id] = snapshot(record);
  }
  mapping.assessmentIds = [...incomingIds];
  mapping.assessmentSnapshots = snapshots;
}
