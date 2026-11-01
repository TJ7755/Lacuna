import Dexie, { type Table, type PromiseExtended } from 'dexie';
import type {
  Card,
  SessionHistoryEntry,
  UserPerformance,
  AppStateEntry,
  MediaAsset,
  BackupSnapshot,
  CourseRecord,
  CourseAssessment,
  Lesson,
  Note,
  LessonCardLink,
  LessonCardExposure,
  LessonCompletion,
  NoteAnnotation,
  PracticeNode,
  PracticeMilestone,
  Sequence,
  RevisionPlan,
  LineageIdMapping,
  PendingMergeReview,
  Occlusion,
  SchedulingUnitRecord,
  CoursePerformance,
  SchedulingPerformance,
  Tombstone,
  AgentMemory,
} from '@lacuna/core/db/types';
import { type ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import {
  reviewActivityProjectionMiddleware,
  type ReviewActivityRow,
} from './reviewActivityProjection';
import { upgradeQuestionSetActivities } from './questionSchemaUpgrades';
import { assertSupportedDatabase, guardedIndexedDB } from './schemaFloor';

/**
 * Lacuna's IndexedDB database. A single Dexie instance owns every store.
 * Indexes are declared in version().stores(); only indexed fields are listed there,
 * other properties are stored implicitly on the record.
 */
class LacunaDatabase extends Dexie {
  cards!: Table<Card, string>;
  sessionHistory!: Table<SessionHistoryEntry, number>;
  userPerformance!: Table<UserPerformance, string>;
  backups!: Table<BackupSnapshot, number>;
  appState!: Table<AppStateEntry, string>;
  assets!: Table<MediaAsset, string>;
  courses!: Table<CourseRecord, string>;
  lessons!: Table<Lesson, string>;
  notes!: Table<Note, string>;
  lessonCards!: Table<LessonCardLink, string>;
  lessonCardExposures!: Table<LessonCardExposure, [string, string]>;
  lessonCompletions!: Table<LessonCompletion, string>;
  noteAnnotations!: Table<NoteAnnotation, string>;
  practiceNodes!: Table<PracticeNode, string>;
  practiceMilestones!: Table<PracticeMilestone, string>;
  courseAssessments!: Table<CourseAssessment, string>;
  sequences!: Table<Sequence, string>;
  revisionPlans!: Table<RevisionPlan, string>;
  lineageIdMappings!: Table<LineageIdMapping, string>;
  pendingMergeReviews!: Table<PendingMergeReview, string>;
  occlusions!: Table<Occlusion, string>;
  reviewHistory!: Table<ReviewHistoryEntry, string>;
  reviewActivity!: Table<ReviewActivityRow, string>;
  schedulingUnits!: Table<SchedulingUnitRecord, string>;
  coursePerformance!: Table<CoursePerformance, string>;
  schedulingPerformance!: Table<SchedulingPerformance, string>;
  tombstones!: Table<Tombstone, [string, string]>;
  concepts!: Table<Concept, string>;
  questions!: Table<QuestionDefinition, string>;
  questionConcepts!: Table<QuestionConceptSet, string>;
  questionAttempts!: Table<QuestionAttempt, string>;
  questionSets!: Table<QuestionSetRecord, string>;
  questionSetAttempts!: Table<QuestionSetAttemptRecord, string>;
  agentMemories!: Table<AgentMemory, string>;

  override open(): PromiseExtended<Dexie> {
    return super.open().catch(async (error: unknown) => {
      await assertSupportedDatabase(this.name);
      throw error;
    });
  }

  constructor() {
    super('lacuna', {
      indexedDB: Dexie.dependencies.indexedDB
        ? guardedIndexedDB(Dexie.dependencies.indexedDB)
        : undefined,
    });
    // v27 is the oldest supported installed schema. Fresh databases use the
    // latest combined schema directly; only later data upgraders may run.
    this.version(27).stores({
      cards:
        'id, courseId, primaryLessonId, schedulingUnitId, conceptId, type, lastReviewed, sequenceItemId, occlusionRegionId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, schedulingUnitId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      courses: 'id, createdAt',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
      lessonCompletions: 'lessonId, completedAt',
      noteAnnotations: 'id, noteId, createdAt, updatedAt',
      practiceNodes: 'id, courseId, position, createdAt',
      practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      sequences: 'id, courseId, primaryLessonId, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
      lineageIdMappings: 'id, courseId',
      pendingMergeReviews: 'id, courseId',
      occlusions: 'id, courseId, primaryLessonId, createdAt',
      reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp',
      schedulingUnits: 'id, kind, courseId, lessonId',
      coursePerformance: 'courseId',
      schedulingPerformance: 'schedulingUnitId, courseId, lessonId',
      tombstones: '[table+recordId], deletedAt',
      concepts: 'id, scopeKey, courseId, updatedAt',
      questions: 'id, courseId, primaryLessonId, kind, due, authoringUpdatedAt',
      questionConcepts:
        'questionId, courseId, *targetConceptIds, *prerequisiteConceptIds, authoringUpdatedAt',
      questionAttempts:
        'id, questionId, courseId, status, shownAt, sessionId, [questionId+shownAt], [courseId+shownAt], updatedAt',
      reviewActivity: 'cardId',
      agentMemories: 'id, courseId, status, updatedAt, *tags',
    });

    // Version 28: authored Question Sets are revisioned document aggregates.
    // This additive store does not reinterpret legacy scheduled Questions.
    this.version(28).stores({
      questionSets: 'id, courseId, *lessonIds, *assessmentIds, updatedAt',
    });

    // Version 29: personal authored Question Set attempts retain complete content receipts.
    this.version(29).stores({
      questionSetAttempts: 'id, courseId, questionSetId, status, updatedAt',
    });

    // Version 30: optional qualified specification links, indexed without rewriting Concepts.
    this.version(30).stores({
      concepts: 'id, scopeKey, courseId, updatedAt, *specificationPointIds',
    });

    // Version 31: ordered activity membership and matching last-imported snapshots.
    this.version(31).stores({}).upgrade(upgradeQuestionSetActivities);
  }
}

export const db = new LacunaDatabase();
db.use(reviewActivityProjectionMiddleware);

// This hook is the storage seam: direct repository writes, restores, imports and
// generated-card modules cannot accidentally resurrect the retired projection.
db.cards.hook('creating', (_primaryKey, card, transaction) => {
  if (transaction.idbtrans.mode !== 'versionchange') card.history = [];
});
db.cards.hook('updating', (_changes, _primaryKey, _card, transaction) =>
  transaction.idbtrans.mode === 'versionchange' ? undefined : { history: [] },
);
