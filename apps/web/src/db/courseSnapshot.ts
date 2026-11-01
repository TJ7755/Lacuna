import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetDraft } from '../questions/questionSetDrafts';
import { finalAssessmentForCourse } from './assessmentMigration';
import { validateAssessmentStructure } from './assessmentValidation';
import { replaceReviewHistoryForCards } from './cardReviewHistory';
import { friendlyDbError } from './dbErrors';
import { clearTombstone, clearTombstones, lessonCardExposureId } from './mutationStamp';
import {
  projectCardsForStorage,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from '@lacuna/core/db/reviewHistory';
import { db, makeId } from './schema';
import type {
  AgentMemory,
  Card,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
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
} from '@lacuna/core/db/types';

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
  questionSets: QuestionSetRecord[];
  questionSetAttempts: QuestionSetAttemptRecord[];
  questionSetDrafts?: QuestionSetDraft[];
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

  const { listQuestionSetDrafts } = await import('../questions/questionSetDrafts');
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
    questionSets,
    questionSetAttempts,
    questionSetDrafts,
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
    db.questionSets.where('courseId').equals(id).toArray(),
    db.questionSetAttempts.where('courseId').equals(id).toArray(),
    listQuestionSetDrafts(id),
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
    questionSets,
    questionSetAttempts,
    questionSetDrafts,
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
    const [{ restoreDeletedQuestionSets }, { questionSetDraftKey }] = await Promise.all([
      import('../questions/questionSetRepository'),
      import('../questions/questionSetDrafts'),
    ]);
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
        db.questionSets,
        db.questionSetAttempts,
        db.lineageIdMappings,
        db.pendingMergeReviews,
        db.agentMemories,
        db.appState,
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await restoreDeletedQuestionSets(snapshot.questionSets ?? [], Date.now());
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
          db.questionSetAttempts.bulkPut(snapshot.questionSetAttempts ?? []),
          db.appState.bulkPut(
            (snapshot.questionSetDrafts ?? []).map((draft) => ({
              key: questionSetDraftKey(snapshot.course.id, draft.content.id),
              value: {
                ...draft,
                draftRevisionId: makeId(),
                updatedAt: Math.max(Date.now(), draft.updatedAt + 1),
              },
            })),
          ),
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
          'questionSets',
          (snapshot.questionSets ?? []).map((set) => set.id),
        );
        await clearTombstones(
          tx,
          'questionSetAttempts',
          (snapshot.questionSetAttempts ?? []).map((attempt) => attempt.id),
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
