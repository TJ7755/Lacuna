import { isLearnerOwnedCheckpoint } from '../course/assessmentOwnership';
import { courseLessonOrderPreference, resolveLessonOrder } from '../course/lessonOrder';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { finalAssessmentForCourse } from './assessmentMigration';
import { syncCourseSchedulingUnits } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { recordTombstone, recordTombstones, stampUpdatedAt } from './mutationStamp';
import { db, makeId } from './schema';
import type { CourseAssessment } from './types';
import { validateAssessmentStructure } from './assessmentValidation';
import { validatePaperAssessmentDates } from '../specifications/assessment';

export { validateAssessmentStructure } from './assessmentValidation';

async function validateAssessmentReferences(assessment: CourseAssessment): Promise<void> {
  const [lessons, cards, links, course, concepts] = await Promise.all([
    db.lessons.toArray(),
    db.cards.toArray(),
    db.lessonCards.toArray(),
    db.courses.get(assessment.courseId),
    db.concepts.where('courseId').equals(assessment.courseId).toArray(),
  ]);
  const issue = resolveAssessmentCoverage(
    assessment,
    lessons,
    cards,
    links,
    course && courseLessonOrderPreference(course),
    { course, concepts },
  ).validation.issues[0];
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
        db.concepts,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        const course = await db.courses.get(courseId);
        if (!course) throw new Error('The course could not be found.');
        const existing = await db.courseAssessments.where('courseId').equals(courseId).toArray();
        finalAssessmentForCourse(courseId, existing);
        const lessons = resolveLessonOrder(
          await db.lessons.where('courseId').equals(courseId).toArray(),
          courseLessonOrderPreference(course),
        );
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
        validatePaperAssessmentDates([...existing, entry]);
        await db.courseAssessments.add(entry);
        await syncCourseSchedulingUnits(courseId);
      },
    );
    return entry!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

interface AssessmentMutationOptions {
  learnerOwnedOnly?: boolean;
}

async function requireLearnerOwnedCheckpoint(assessment: CourseAssessment): Promise<void> {
  const course = await db.courses.get(assessment.courseId);
  const lineageId = course?.distributedCopy?.lineageId;
  const mapping = lineageId ? await db.lineageIdMappings.get(lineageId) : undefined;
  if (!isLearnerOwnedCheckpoint(course, assessment, mapping)) {
    throw new Error('Only your own checkpoints can be changed here.');
  }
}

export async function updateCourseAssessment(
  id: string,
  changes: Partial<CourseAssessment>,
  options?: AssessmentMutationOptions,
): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        ...(options?.learnerOwnedOnly ? [db.lineageIdMappings] : []),
        db.lessons,
        db.cards,
        db.concepts,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        const existing = await db.courseAssessments.get(id);
        if (!existing) throw new Error('The assessment could not be found.');
        if (options?.learnerOwnedOnly) await requireLearnerOwnedCheckpoint(existing);
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
        validatePaperAssessmentDates(
          assessments.map((entry) => (entry.id === id ? updated : entry)),
        );
        await db.courseAssessments.put(updated);
        await syncCourseSchedulingUnits(existing.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteCourseAssessment(
  id: string,
  options?: AssessmentMutationOptions,
): Promise<void> {
  try {
    // Loaded on demand, before the transaction opens, to keep question sets out of the first load.
    const { removeQuestionSetAssessmentReference } =
      await import('../questions/questionSetRepository');
    await db.transaction(
      'rw',
      [
        db.courses,
        ...(options?.learnerOwnedOnly ? [db.lineageIdMappings] : []),
        db.lessons,
        db.courseAssessments,
        db.questionSets,
        db.revisionPlans,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.tombstones,
      ],
      async (tx) => {
        const assessment = await db.courseAssessments.get(id);
        if (!assessment) return;
        if (options?.learnerOwnedOnly) await requireLearnerOwnedCheckpoint(assessment);
        if (assessment.kind === 'final')
          throw new Error('The sole final assessment cannot be deleted.');
        const revisionPlanIds = (
          await db.revisionPlans.where('assessmentId').equals(id).primaryKeys()
        ).map(String);
        await db.revisionPlans.where('assessmentId').equals(id).delete();
        await removeQuestionSetAssessmentReference(assessment.courseId, id, Date.now());
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
