import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { finalAssessmentForCourse } from './assessmentMigration';
import { syncCourseSchedulingUnits } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { recordTombstone, recordTombstones, stampUpdatedAt } from './mutationStamp';
import { db, makeId } from './schema';
import type { CourseAssessment } from './types';

export function validateAssessmentStructure(assessment: CourseAssessment): void {
  if (assessment.kind !== 'final' && assessment.kind !== 'checkpoint') {
    throw new Error('Assessment kind must be final or checkpoint.');
  }
  if (
    assessment.afterLessonId !== null &&
    (typeof assessment.afterLessonId !== 'string' || assessment.afterLessonId.length === 0)
  ) {
    throw new Error('An assessment path position must be a lesson id or null.');
  }
  if (assessment.kind === 'checkpoint') {
    if (assessment.schedulingMode === 'steady') {
      throw new Error('Only the final assessment can use steady retention.');
    }
    if (!Number.isFinite(assessment.examDate)) {
      throw new Error('An assessment date must be a finite timestamp.');
    }
  } else if (assessment.schedulingMode === 'steady') {
    if (assessment.examDate !== undefined || assessment.timeZone !== undefined) {
      throw new Error('Steady retention cannot store an exam date or time zone.');
    }
  } else if (!Number.isFinite(assessment.examDate)) {
    throw new Error('An exam-targeted final assessment must have a finite timestamp.');
  }
  if (
    assessment.needsAuthorConfirmation !== undefined &&
    typeof assessment.needsAuthorConfirmation !== 'boolean'
  ) {
    throw new Error('Assessment author-confirmation state must be boolean.');
  }
  if (!Array.isArray(assessment.excludedCardIds)) {
    throw new Error('Assessment exclusions must be an explicit card-id array.');
  }
  if (
    assessment.excludedCardIds.some((cardId) => typeof cardId !== 'string' || cardId.length === 0)
  ) {
    throw new Error('Assessment exclusions must contain valid card ids.');
  }
  if (new Set(assessment.excludedCardIds).size !== assessment.excludedCardIds.length) {
    throw new Error('Assessment exclusions cannot contain duplicate card ids.');
  }
  if (assessment.coverageMode === 'prefix') {
    if (assessment.lessonIds !== undefined) {
      throw new Error('Prefix assessment coverage cannot store lesson ids.');
    }
    return;
  }
  if (assessment.coverageMode === 'custom') {
    if (!Array.isArray(assessment.lessonIds) || assessment.lessonIds.length === 0) {
      throw new Error('Custom assessment coverage requires an explicit lesson-id array.');
    }
    if (
      assessment.lessonIds.some((lessonId) => typeof lessonId !== 'string' || lessonId.length === 0)
    ) {
      throw new Error('Custom assessment coverage must contain valid lesson ids.');
    }
    if (new Set(assessment.lessonIds).size !== assessment.lessonIds.length) {
      throw new Error('Custom assessment coverage cannot contain duplicate lesson ids.');
    }
    return;
  }
  throw new Error('Assessment coverage mode must be prefix or custom.');
}

async function validateAssessmentReferences(assessment: CourseAssessment): Promise<void> {
  const [lessons, cards, links] = await Promise.all([
    db.lessons.toArray(),
    db.cards.toArray(),
    db.lessonCards.toArray(),
  ]);
  const issue = resolveAssessmentCoverage(assessment, lessons, cards, links).validation.issues[0];
  if (issue) throw new Error(issue.message);
}

export async function createCourseAssessment(
  courseId: string,
  name: string,
  examDate: number,
  opts?: Partial<CourseAssessment>,
): Promise<CourseAssessment> {
  try {
    let entry: CourseAssessment | undefined;
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        if (!(await db.courses.get(courseId))) throw new Error('The course could not be found.');
        const existing = await db.courseAssessments.where('courseId').equals(courseId).toArray();
        finalAssessmentForCourse(courseId, existing);
        const lessons = await db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
        const coverageMode =
          opts?.coverageMode ??
          (Array.isArray(opts?.lessonIds) && opts.lessonIds.length > 0 ? 'custom' : 'prefix');
        const coveredLessonIds = new Set(coverageMode === 'custom' ? (opts?.lessonIds ?? []) : []);
        const inferredAnchor =
          [...lessons]
            .reverse()
            .find((lesson) => coverageMode === 'prefix' || coveredLessonIds.has(lesson.id))?.id ??
          null;
        const afterLessonId =
          opts !== undefined && Object.prototype.hasOwnProperty.call(opts, 'afterLessonId')
            ? opts.afterLessonId!
            : inferredAnchor;
        const createdAt = Date.now();
        entry = stampUpdatedAt(
          {
            kind: 'checkpoint',
            excludedCardIds: [],
            ...opts,
            id: makeId(),
            courseId,
            name,
            examDate,
            afterLessonId,
            coverageMode,
            createdAt,
          } as CourseAssessment,
          createdAt,
        );
        validateAssessmentStructure(entry);
        await validateAssessmentReferences(entry);
        if (entry.kind === 'final')
          throw new Error('A course must have exactly one final assessment.');
        await db.courseAssessments.add(entry);
        await syncCourseSchedulingUnits(courseId);
      },
    );
    return entry!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateCourseAssessment(
  id: string,
  changes: Partial<CourseAssessment>,
): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        const existing = await db.courseAssessments.get(id);
        if (!existing) throw new Error('The assessment could not be found.');
        if (changes.courseId !== undefined && changes.courseId !== existing.courseId)
          throw new Error('An assessment cannot move to another course.');
        const updated = stampUpdatedAt({
          ...existing,
          ...changes,
          id: existing.id,
          courseId: existing.courseId,
          createdAt: existing.createdAt,
        } as CourseAssessment);
        if (updated.kind === 'final' && updated.schedulingMode === 'steady') {
          delete updated.examDate;
          delete updated.timeZone;
        }
        validateAssessmentStructure(updated);
        await validateAssessmentReferences(updated);
        const assessments = await db.courseAssessments
          .where('courseId')
          .equals(existing.courseId)
          .toArray();
        const finalAssessment = finalAssessmentForCourse(existing.courseId, assessments);
        if (existing.kind === 'final' && updated.kind !== 'final')
          throw new Error('The sole final assessment cannot be demoted.');
        if (existing.kind !== 'final' && updated.kind === 'final' && finalAssessment.id !== id)
          throw new Error('A course must have exactly one final assessment.');
        await db.courseAssessments.put(updated);
        await syncCourseSchedulingUnits(existing.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteCourseAssessment(id: string): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.revisionPlans,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.tombstones,
      ],
      async (tx) => {
        const assessment = await db.courseAssessments.get(id);
        if (!assessment) return;
        if (assessment.kind === 'final')
          throw new Error('The sole final assessment cannot be deleted.');
        const revisionPlanIds = (
          await db.revisionPlans.where('assessmentId').equals(id).primaryKeys()
        ).map(String);
        await db.revisionPlans.where('assessmentId').equals(id).delete();
        await db.courseAssessments.delete(id);
        await recordTombstone(tx, 'courseAssessments', id);
        await recordTombstones(tx, 'revisionPlans', revisionPlanIds);
        await syncCourseSchedulingUnits(assessment.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
