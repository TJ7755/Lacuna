import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { canEditLessons } from '../course/lessonViewMode';
import { parseSpecificationReference, type SpecificationReference } from '../specifications/links';
import { readPracticeDefaults } from '../state/practiceDefaults';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { courseToRecord, hydrateCourse } from './assessmentMigration';
import { validateAssessmentStructure } from './assessmentRepository';
import { scheduleAssetGc } from './assets';
import { removeCourseSchedulingUnits, syncCourseSchedulingUnits } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import {
  lessonCardExposureId,
  recordTombstone,
  recordTombstones,
  stampUpdatedAt,
} from './mutationStamp';
import { db, makeId } from './schema';
import type {
  Course,
  CourseAssessment,
  CourseRecord,
  CourseSchedulingMode,
  SchedulingPerformance,
  SchedulingUnitRecord,
} from './types';

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export type CreateCourseOptions = Partial<CourseRecord> & {
  schedulingMode?: CourseSchedulingMode;
  examDate?: number;
  timeZone?: string;
};

export async function createCourse(name: string, opts?: CreateCourseOptions): Promise<Course> {
  try {
    const createdAt = Date.now();
    const practiceDefaults = readPracticeDefaults();
    const {
      schedulingMode = 'exam',
      examDate: requestedExamDate,
      timeZone: requestedTimeZone,
      ...recordOptions
    } = opts ?? {};
    if (recordOptions.specificationRef !== undefined) {
      recordOptions.specificationRef = parseSpecificationReference(recordOptions.specificationRef);
    }
    if (schedulingMode === 'steady' && requestedExamDate !== undefined) {
      throw new Error('A steady-retention course cannot also have an exam date.');
    }
    const examDate =
      schedulingMode === 'exam' ? (requestedExamDate ?? defaultExamDate(createdAt)) : undefined;
    const timeZone =
      schedulingMode === 'exam' ? (requestedTimeZone ?? getLocalTimeZone()) : undefined;
    const course = stampUpdatedAt(
      {
        id: makeId(),
        name: name.trim() || 'Untitled course',
        description: '',
        createdAt,
        fsrsVersion: FSRS_VERSION,
        fsrsParameters: defaultFsrsParameters(),
        examObjective: 'expectedMarks',
        unlockMode: 'open',
        // New courses default to edit mode (see src/course/lessonViewMode.ts).
        // Share-code import (src/db/share.ts) overrides this to 'study' via opts.
        lessonViewMode: 'edit',
        ...practiceDefaults,
        ...recordOptions,
        schedulingMode,
        ...(examDate === undefined ? {} : { examDate }),
        ...(timeZone === undefined ? {} : { timeZone }),
      } as Course,
      createdAt,
    );
    const record = courseToRecord(course);
    const finalAssessment = stampUpdatedAt(
      {
        id: makeId(),
        courseId: record.id,
        name: schedulingMode === 'steady' ? 'Steady retention' : 'Final exam',
        kind: 'final',
        schedulingMode,
        ...(course.examDate === undefined ? {} : { examDate: course.examDate }),
        ...(course.timeZone !== undefined ? { timeZone: course.timeZone } : {}),
        afterLessonId: null,
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: record.createdAt,
        updatedAt: createdAt,
      } as CourseAssessment,
      createdAt,
    );
    validateAssessmentStructure(finalAssessment);
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.courses.add(record);
        await db.courseAssessments.add(finalAssessment);
        await syncCourseSchedulingUnits(record.id);
      },
    );
    return hydrateCourse(record, finalAssessment);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * One-shot migration (see App.tsx, guarded by a localStorage flag): stamps
 * every course that predates the mandatory Course.lessonViewMode field with
 * the retired global default's last value, so existing users see no change
 * in behaviour. New courses and share-code imports already set this
 * explicitly (see createCourse/importCourseFromShare), so only old rows are
 * touched. Not a Dexie schema upgrade because the value being migrated lives
 * in localStorage, not IndexedDB — an upgrade() callback cannot depend on it
 * reliably (e.g. across origins/devices with mismatched localStorage).
 */
export { stampMissingLessonViewModes } from './lessonViewModeMigration';

export async function updateCourse(id: string, changes: Partial<CourseRecord>): Promise<void> {
  try {
    const setsReference = Object.prototype.hasOwnProperty.call(changes, 'specificationRef');
    const validatedChanges = setsReference
      ? {
          ...changes,
          specificationRef:
            changes.specificationRef === undefined
              ? undefined
              : parseSpecificationReference(changes.specificationRef),
        }
      : changes;
    const compatibilityChanges = changes as Partial<Course>;
    if (
      Object.prototype.hasOwnProperty.call(compatibilityChanges, 'examDate') ||
      Object.prototype.hasOwnProperty.call(compatibilityChanges, 'timeZone')
    ) {
      throw new Error('Course examDate and timeZone are derived, read-only assessment values.');
    }
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        if (setsReference) {
          const course = await db.courses.get(id);
          if (!course) throw new Error('The course could not be found.');
          if (!canEditLessons(course)) throw new Error('This published course is locked.');
        }
        await db.courses.update(id, stampUpdatedAt(validatedChanges));
        await syncCourseSchedulingUnits(id);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function setCourseSpecificationReference(
  courseId: string,
  reference: SpecificationReference | undefined,
): Promise<void> {
  try {
    const specificationRef =
      reference === undefined ? undefined : parseSpecificationReference(reference);
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      if (!canEditLessons(course)) throw new Error('This published course is locked.');
      await db.courses.update(courseId, stampUpdatedAt({ specificationRef }));
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Delete a course and cascade to all dependent rows in one transaction:
 * notes and lessonCard links belonging to the course's lessons, the lessons
 * themselves, practice nodes, course assessments, occlusions, and cards whose
 * courseId matches. Cards are deleted (not unassigned) because they were
 * created for this course; the cascade mirrors deleteDeck deleting its cards.
 */
export async function deleteCourse(id: string): Promise<void> {
  const { listQuestionSetDrafts, questionSetDraftKey } =
    await import('../questions/questionSetDrafts');
  await db.transaction(
    'rw',
    [
      db.courses,
      db.lessons,
      db.notes,
      db.noteAnnotations,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.practiceNodes,
      db.practiceMilestones,
      db.courseAssessments,
      db.cards,
      db.sessionHistory,
      db.sequences,
      db.revisionPlans,
      db.occlusions,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.concepts,
      db.questions,
      db.questionConcepts,
      db.questionAttempts,
      db.questionSets,
      db.questionSetAttempts,
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
      db.appState,
      db.tombstones,
    ],
    async (tx) => {
      const lessonIds = (await db.lessons.where('courseId').equals(id).primaryKeys()).map(String);
      const noteIds =
        lessonIds.length > 0
          ? (await db.notes.where('lessonId').anyOf(lessonIds).primaryKeys()).map(String)
          : [];
      const lessonCards =
        lessonIds.length > 0
          ? await db.lessonCards.where('lessonId').anyOf(lessonIds).toArray()
          : [];
      const exposures =
        lessonIds.length > 0
          ? await db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
          : [];
      const completionIds =
        lessonIds.length > 0
          ? (await db.lessonCompletions.where('lessonId').anyOf(lessonIds).primaryKeys()).map(
              String,
            )
          : [];
      const practiceNodeIds = (
        await db.practiceNodes.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const milestoneIds = (
        await db.practiceMilestones.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const assessmentIds = (
        await db.courseAssessments.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const revisionPlanIds = (
        await db.revisionPlans.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const sequenceIds = (await db.sequences.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const cardIds = (await db.cards.where('courseId').equals(id).primaryKeys()).map(String);
      const conceptIds = (await db.concepts.where('courseId').equals(id).primaryKeys()).map(String);
      const questionIds = (await db.questions.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const questionConceptIds = (
        await db.questionConcepts.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const questionAttemptIds = (
        await db.questionAttempts.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const questionSets = await db.questionSets.where('courseId').equals(id).toArray();
      const questionSetAttemptIds = (
        await db.questionSetAttempts.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const questionSetDrafts = await listQuestionSetDrafts(id);
      const lineageMappingIds = (
        await db.lineageIdMappings.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const pendingMergeReviewIds = (
        await db.pendingMergeReviews.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const agentMemories = await db.agentMemories.where('courseId').equals(id).toArray();
      const agentMemoryIds = agentMemories.map((memory) => memory.id);
      const agentMemoryDeletedAt = Math.max(
        Date.now(),
        ...agentMemories.map((memory) => memory.updatedAt + 1),
      );
      const occlusionIds = (await db.occlusions.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const schedulingTargetIds = [id, ...lessonIds];
      const existingUnits = await db.schedulingUnits.bulkGet(schedulingTargetIds);
      const schedulingUnitIds = existingUnits
        .filter((unit): unit is SchedulingUnitRecord => unit !== undefined)
        .map((unit) => unit.id);
      const existingSchedulingPerf = await db.schedulingPerformance.bulkGet(schedulingTargetIds);
      const schedulingPerformanceIds = existingSchedulingPerf
        .filter((row): row is SchedulingPerformance => row !== undefined)
        .map((row) => row.schedulingUnitId);
      const coursePerformanceRow = await db.coursePerformance.get(id);

      if (noteIds.length > 0) {
        await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
      }
      if (lessonIds.length > 0) {
        await db.notes.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCards.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCardExposures.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCompletions.where('lessonId').anyOf(lessonIds).delete();
      }
      await db.lessons.where('courseId').equals(id).delete();
      await db.practiceNodes.where('courseId').equals(id).delete();
      await db.practiceMilestones.where('courseId').equals(id).delete();
      await db.courseAssessments.where('courseId').equals(id).delete();
      await db.revisionPlans.where('courseId').equals(id).delete();
      await db.sequences.where('courseId').equals(id).delete();
      await db.occlusions.where('courseId').equals(id).delete();
      await db.cards.where('courseId').equals(id).delete();
      await db.questionAttempts.where('courseId').equals(id).delete();
      await db.questionSets.where('courseId').equals(id).delete();
      await db.questionSetAttempts.where('courseId').equals(id).delete();
      await db.appState.bulkDelete(
        questionSetDrafts.map((draft) => questionSetDraftKey(id, draft.content.id)),
      );
      await db.questionConcepts.where('courseId').equals(id).delete();
      await db.questions.where('courseId').equals(id).delete();
      await db.concepts.where('courseId').equals(id).delete();
      await db.lineageIdMappings.where('courseId').equals(id).delete();
      await db.pendingMergeReviews.where('courseId').equals(id).delete();
      await db.agentMemories.where('courseId').equals(id).delete();
      await db.reviewHistory.where('courseId').equals(id).delete();
      // The course-level calibration profile and session history are keyed by the
      // course id itself for course/lesson-scoped reviews (see recordReview).
      await db.sessionHistory.where('courseId').equals(id).delete();
      await removeCourseSchedulingUnits(id, lessonIds);
      await db.courses.delete(id);

      await recordTombstone(tx, 'courses', id);
      await recordTombstones(tx, 'lessons', lessonIds);
      await recordTombstones(tx, 'notes', noteIds);
      await recordTombstones(
        tx,
        'lessonCards',
        lessonCards.map((link) => link.id),
      );
      await recordTombstones(
        tx,
        'lessonCardExposures',
        exposures.map((exposure) => lessonCardExposureId(exposure.lessonId, exposure.cardId)),
      );
      await recordTombstones(tx, 'lessonCompletions', completionIds);
      await recordTombstones(tx, 'practiceNodes', practiceNodeIds);
      await recordTombstones(tx, 'practiceMilestones', milestoneIds);
      await recordTombstones(tx, 'courseAssessments', assessmentIds);
      await recordTombstones(tx, 'revisionPlans', revisionPlanIds);
      await recordTombstones(tx, 'sequences', sequenceIds);
      await recordTombstones(tx, 'cards', cardIds);
      await recordTombstones(tx, 'concepts', conceptIds);
      await recordTombstones(tx, 'questions', questionIds);
      await recordTombstones(tx, 'questionConcepts', questionConceptIds);
      await recordTombstones(tx, 'questionAttempts', questionAttemptIds);
      await recordTombstones(tx, 'questionSetAttempts', questionSetAttemptIds);
      for (const set of questionSets) {
        await recordTombstone(tx, 'questionSets', set.id, Math.max(Date.now(), set.updatedAt + 1));
      }
      await recordTombstones(tx, 'lineageIdMappings', lineageMappingIds);
      await recordTombstones(tx, 'pendingMergeReviews', pendingMergeReviewIds);
      await recordTombstones(tx, 'agentMemories', agentMemoryIds, agentMemoryDeletedAt);
      await recordTombstones(tx, 'occlusions', occlusionIds);
      await recordTombstones(tx, 'schedulingUnits', schedulingUnitIds);
      if (coursePerformanceRow) await recordTombstone(tx, 'coursePerformance', id);
      await recordTombstones(tx, 'schedulingPerformance', schedulingPerformanceIds);
    },
  );
  // Deleting the course's cards may orphan image assets; reclaim them, as deleteDeck does.
  scheduleAssetGc();
}

export {
  publishCourse,
  detachCourse,
  setCourseAutoAcceptUpdates,
  setCourseShareId,
  clearCourseShareId,
} from './coursePublication';
export { snapshotCourse, restoreCourse } from './courseSnapshot';
export type { CourseSnapshot } from './courseSnapshot';
