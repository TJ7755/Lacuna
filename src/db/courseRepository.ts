// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';
import { readLessonViewMode } from '../state/lessonViewMode';
import { readPracticeDefaults } from '../state/practiceDefaults';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { courseToRecord, finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';
import { validateAssessmentStructure } from './assessmentRepository';
import { scheduleAssetGc } from './assets';
import { removeCourseSchedulingUnits, syncCourseSchedulingUnits } from './backingDecks';
import { replaceReviewHistoryForCards } from './cardRepository';
import { friendlyDbError } from './dbErrors';
import {
  clearTombstone,
  clearTombstones,
  lessonCardExposureId,
  recordTombstone,
  recordTombstones,
  stampUpdatedAt,
} from './mutationStamp';
import {
  projectCardsForStorage,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { db, makeId } from './schema';
import type {
  AgentMemory,
  Card,
  Course,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
  CourseSchedulingMode,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  LineageIdMapping,
  Note,
  NoteAnnotation,
  Occlusion,
  PendingMergeReview,
  PracticeMilestone,
  PracticeNode,
  RevisionPlan,
  SchedulingPerformance,
  SchedulingUnitRecord,
  Sequence,
  SessionHistoryEntry,
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
export async function stampMissingLessonViewModes(): Promise<void> {
  const globalDefault = readLessonViewMode();
  // lessonViewMode is not an indexed field, so this is a full-table filter
  // rather than a where() query — acceptable for a one-off migration.
  const unstamped = await db.courses.filter((c) => c.lessonViewMode === undefined).toArray();
  if (unstamped.length === 0) return;
  await db.courses.bulkUpdate(
    unstamped.map((c) => ({ key: c.id, changes: { lessonViewMode: globalDefault } })),
  );
}

export async function updateCourse(id: string, changes: Partial<CourseRecord>): Promise<void> {
  try {
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
        await db.courses.update(id, stampUpdatedAt(changes));
        await syncCourseSchedulingUnits(id);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Publish (or republish) a course for classroom distribution (Arc 7 §7.4).
 * First publish creates `Course.distribution` with a fresh `lineageId` and
 * `revision: 1`; every subsequent call keeps the same `lineageId` and
 * increments `revision` by one. The share-code export path (`src/db/share.ts`)
 * reads `Course.distribution` to decide whether to pack lineage/revision/
 * originating-id fields into the payload — this function only owns the
 * counter, not the encoding.
 */
export async function publishCourse(
  courseId: string,
): Promise<{ lineageId: string; revision: number; publishedAt: number }> {
  try {
    let distribution: { lineageId: string; revision: number; publishedAt: number } | undefined;
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      distribution = {
        lineageId: course.distribution?.lineageId ?? makeId(),
        revision: (course.distribution?.revision ?? 0) + 1,
        publishedAt: Date.now(),
      };
      await db.courses.update(courseId, stampUpdatedAt({ distribution }));
    });
    return distribution!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Detach a student's imported course from its teacher's lineage (Arc 7 §7.1). A
 * one-way escape hatch from a locked distributed copy: clears `Course.distributedCopy`
 * entirely, which both unlocks the course (absent `distributedCopy` is editable per
 * `canEditLessons`) and severs lineage tracking, so a later re-import of the same share
 * code no longer matches this course and instead falls through to a plain
 * `importCourseSharePayload` — the same "no lineage, treat as new" path a pre-Arc-7
 * course already takes. The lineage's adopted-id membership registry and any pending
 * merge review for this course are removed alongside, since neither can ever be
 * consulted or applied again once the course is detached; the lesson/note/card content
 * itself is untouched.
 */
export async function detachCourse(courseId: string): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.courses, db.lineageIdMappings, db.pendingMergeReviews],
      async () => {
        const course = await db.courses.get(courseId);
        if (!course) throw new Error('The course could not be found.');
        const lineageId = course.distributedCopy?.lineageId;
        await db.courses.update(courseId, stampUpdatedAt({ distributedCopy: undefined }));
        if (lineageId) {
          await db.lineageIdMappings.delete(lineageId);
        }
        await db.pendingMergeReviews.where('courseId').equals(courseId).delete();
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Sets `distributedCopy.autoAcceptUpdates` on a student's imported course (Arc 7 §7.1,
 * §7.9 Task 8). The value is read by the merge-apply decision in `mergeImport.ts` to
 * decide whether a future teacher update is applied silently or queued for review; this
 * function only persists the preference, it does not affect any pending review.
 */
export async function setCourseAutoAcceptUpdates(
  courseId: string,
  autoAcceptUpdates: boolean,
): Promise<void> {
  try {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('The course could not be found.');
    if (!course.distributedCopy) throw new Error('This course is not a shared copy.');
    await db.courses.update(
      courseId,
      stampUpdatedAt({
        distributedCopy: { ...course.distributedCopy, autoAcceptUpdates },
      }),
    );
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
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
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

/** A complete copy of a course and everything that hangs off it: lessons, notes,
 * lesson-card links, practice nodes, assessments, occlusions, cards and their
 * hidden backing decks (plus the session history and calibration profiles keyed
 * to either). */
export interface CourseSnapshot {
  course: CourseRecord;
  lessons: Lesson[];
  notes: Note[];
  noteAnnotations: NoteAnnotation[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  practiceMilestones: PracticeMilestone[];
  courseAssessments: CourseAssessment[];
  revisionPlans: RevisionPlan[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  cards: Card[];
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
  lineageIdMappings: LineageIdMapping[];
  pendingMergeReviews: PendingMergeReview[];
  agentMemories?: AgentMemory[];
  sessionHistory: SessionHistoryEntry[];
  reviewHistory: ReviewHistoryEntry[];
  coursePerformance: CoursePerformance[];
  schedulingUnits: SchedulingUnitRecord[];
  schedulingPerformance: SchedulingPerformance[];
}

/**
 * Capture a course plus everything {@link deleteCourse} removes, so the action can be
 * offered with an "Undo". Call this *before* deleteCourse.
 */
export async function snapshotCourse(id: string): Promise<CourseSnapshot | null> {
  const course = await db.courses.get(id);
  if (!course) return null;

  const [
    lessons,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    revisionPlans,
    sequences,
    occlusions,
    cards,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
    coursePerformance,
  ] = await Promise.all([
    db.lessons.where('courseId').equals(id).toArray(),
    db.practiceNodes.where('courseId').equals(id).toArray(),
    db.practiceMilestones.where('courseId').equals(id).toArray(),
    db.courseAssessments.where('courseId').equals(id).toArray(),
    db.revisionPlans.where('courseId').equals(id).toArray(),
    db.sequences.where('courseId').equals(id).toArray(),
    db.occlusions.where('courseId').equals(id).toArray(),
    db.cards.where('courseId').equals(id).toArray(),
    db.concepts.where('courseId').equals(id).toArray(),
    db.questions.where('courseId').equals(id).toArray(),
    db.questionConcepts.where('courseId').equals(id).toArray(),
    db.questionAttempts.where('courseId').equals(id).toArray(),
    db.lineageIdMappings.where('courseId').equals(id).toArray(),
    db.pendingMergeReviews.where('courseId').equals(id).toArray(),
    db.agentMemories.where('courseId').equals(id).toArray(),
    db.coursePerformance.where('courseId').equals(id).toArray(),
  ]);
  const reviewHistoryForCourse =
    cards.length > 0
      ? await db.reviewHistory
          .where('cardId')
          .anyOf(cards.map((card) => card.id))
          .toArray()
      : [];
  const lessonIds = lessons.map((l) => l.id);
  const targetIds = [id, ...lessonIds];
  const [schedulingUnits, schedulingPerformance] = await Promise.all([
    db.schedulingUnits
      .bulkGet(targetIds)
      .then((rows) => rows.filter((row): row is SchedulingUnitRecord => row !== undefined)),
    db.schedulingPerformance
      .bulkGet(targetIds)
      .then((rows) => rows.filter((row): row is SchedulingPerformance => row !== undefined)),
  ]);
  const [notes, lessonCards, lessonCardExposures, lessonCompletions, courseSessionHistory] =
    await Promise.all([
      lessonIds.length > 0 ? db.notes.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      db.sessionHistory.where('courseId').equals(id).toArray(),
    ]);
  const noteAnnotations =
    notes.length > 0
      ? await db.noteAnnotations
          .where('noteId')
          .anyOf(notes.map((note) => note.id))
          .toArray()
      : [];

  return {
    course,
    lessons,
    notes,
    noteAnnotations,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    revisionPlans,
    sequences,
    occlusions,
    cards,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
    sessionHistory: courseSessionHistory,
    reviewHistory: reviewHistoryForCourse,
    coursePerformance,
    schedulingUnits,
    schedulingPerformance,
  };
}

/** Re-insert a previously captured CourseSnapshot (the inverse of deleteCourse). */
export async function restoreCourse(snapshot: CourseSnapshot): Promise<void> {
  try {
    finalAssessmentForCourse(snapshot.course.id, snapshot.courseAssessments);
    const cardsToRestore = projectCardsForStorage(snapshot.cards);
    const reviewHistoryToRestore =
      snapshot.reviewHistory ?? snapshot.cards.flatMap((card) => reviewHistoryEntriesForCard(card));
    for (const assessment of snapshot.courseAssessments) {
      if (assessment.courseId !== snapshot.course.id) {
        throw new Error('A course snapshot cannot contain assessments from another course.');
      }
      validateAssessmentStructure(assessment);
    }
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
        db.revisionPlans,
        db.sequences,
        db.occlusions,
        db.cards,
        db.sessionHistory,
        db.reviewHistory,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.concepts,
        db.questions,
        db.questionConcepts,
        db.questionAttempts,
        db.lineageIdMappings,
        db.pendingMergeReviews,
        db.agentMemories,
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await Promise.all([
          db.courses.put(snapshot.course),
          db.lessons.bulkPut(snapshot.lessons),
          db.notes.bulkPut(snapshot.notes),
          db.noteAnnotations.bulkPut(snapshot.noteAnnotations),
          db.lessonCards.bulkPut(snapshot.lessonCards),
          db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures),
          db.lessonCompletions.bulkPut(snapshot.lessonCompletions),
          db.practiceNodes.bulkPut(snapshot.practiceNodes),
          db.practiceMilestones.bulkPut(snapshot.practiceMilestones),
          db.courseAssessments.bulkPut(snapshot.courseAssessments),
          db.revisionPlans.bulkPut(snapshot.revisionPlans),
          db.sequences.bulkPut(snapshot.sequences),
          db.occlusions.bulkPut(snapshot.occlusions),
          db.cards.bulkPut(cardsToRestore),
          db.concepts.bulkPut(snapshot.concepts),
          db.questions.bulkPut(snapshot.questions),
          db.questionConcepts.bulkPut(snapshot.questionConcepts),
          db.questionAttempts.bulkPut(snapshot.questionAttempts),
          db.lineageIdMappings.bulkPut(snapshot.lineageIdMappings),
          db.pendingMergeReviews.bulkPut(snapshot.pendingMergeReviews),
          db.agentMemories.bulkPut(
            await Promise.all(
              (snapshot.agentMemories ?? []).map(async (memory) => {
                const deletion = await db.tombstones.get(['agentMemories', memory.id]);
                return {
                  ...memory,
                  updatedAt: Math.max(
                    Date.now(),
                    memory.updatedAt + 1,
                    (deletion?.deletedAt ?? 0) + 1,
                  ),
                };
              }),
            ),
          ),
          db.schedulingUnits.bulkPut(snapshot.schedulingUnits),
          db.coursePerformance.bulkPut(snapshot.coursePerformance),
          db.schedulingPerformance.bulkPut(snapshot.schedulingPerformance),
          // Drop the old auto-increment ids so Dexie reassigns them cleanly.
          db.sessionHistory.bulkAdd(
            snapshot.sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
          ),
        ]);
        await clearTombstone(tx, 'courses', snapshot.course.id);
        await clearTombstones(
          tx,
          'lessons',
          snapshot.lessons.map((lesson) => lesson.id),
        );
        await clearTombstones(
          tx,
          'notes',
          snapshot.notes.map((note) => note.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          snapshot.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          snapshot.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
        await clearTombstones(
          tx,
          'lessonCompletions',
          snapshot.lessonCompletions.map((completion) => completion.lessonId),
        );
        await clearTombstones(
          tx,
          'practiceNodes',
          snapshot.practiceNodes.map((node) => node.id),
        );
        await clearTombstones(
          tx,
          'practiceMilestones',
          snapshot.practiceMilestones.map((milestone) => milestone.nodeKey),
        );
        await clearTombstones(
          tx,
          'courseAssessments',
          snapshot.courseAssessments.map((assessment) => assessment.id),
        );
        await clearTombstones(
          tx,
          'revisionPlans',
          snapshot.revisionPlans.map((plan) => plan.id),
        );
        await clearTombstones(
          tx,
          'sequences',
          snapshot.sequences.map((sequence) => sequence.id),
        );
        await clearTombstones(
          tx,
          'occlusions',
          snapshot.occlusions.map((occlusion) => occlusion.id),
        );
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'concepts',
          snapshot.concepts.map((concept) => concept.id),
        );
        await clearTombstones(
          tx,
          'questions',
          snapshot.questions.map((question) => question.id),
        );
        await clearTombstones(
          tx,
          'questionConcepts',
          snapshot.questionConcepts.map((set) => set.questionId),
        );
        await clearTombstones(
          tx,
          'questionAttempts',
          snapshot.questionAttempts.map((attempt) => attempt.id),
        );
        await clearTombstones(
          tx,
          'lineageIdMappings',
          snapshot.lineageIdMappings.map((mapping) => mapping.id),
        );
        await clearTombstones(
          tx,
          'pendingMergeReviews',
          snapshot.pendingMergeReviews.map((review) => review.id),
        );
        await clearTombstones(
          tx,
          'agentMemories',
          (snapshot.agentMemories ?? []).map((memory) => memory.id),
        );
        await clearTombstones(
          tx,
          'schedulingUnits',
          snapshot.schedulingUnits.map((unit) => unit.id),
        );
        await clearTombstones(
          tx,
          'coursePerformance',
          snapshot.coursePerformance.map((row) => row.courseId),
        );
        await clearTombstones(
          tx,
          'schedulingPerformance',
          snapshot.schedulingPerformance.map((row) => row.schedulingUnitId),
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}
