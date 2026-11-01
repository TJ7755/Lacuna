import Dexie, { type Table } from 'dexie';
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
} from './types';
import { type ReviewHistoryEntry } from './reviewHistory';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import {
  reviewActivityProjectionMiddleware,
  type ReviewActivityRow,
} from './reviewActivityProjection';
import {
  upgradeLegacyFsrs,
  upgradeLegacyCardFlags,
  upgradeLegacyMarkdownAssets,
  upgradeLegacySchedulingControls,
  upgradeLegacyCourses,
  upgradeLessonExposures,
  upgradeTypedCards,
  upgradeCourseAssessments,
} from './legacySchemaUpgrades';
import {
  upgradeCanonicalReviewHistory,
  upgradeStoredReviewProjection,
  upgradeReviewActivity,
} from './reviewHistoryUpgrades';
import {
  upgradeDomainStorage,
  validateLegacyStorageRemoval,
  upgradeMutationTimestamps,
} from './domainStorageUpgrades';
import { upgradeQuestionStorage, upgradeQuestionSetActivities } from './questionSchemaUpgrades';

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

  constructor() {
    super('lacuna');
    this.version(1).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
    });

    // Version 2: migrate the FSRS-4.5 (17-parameter) model to FSRS-6. The indexes
    // are unchanged; the upgrade only enriches existing records with the new
    // FSRS-6 fields. No user data is dropped.
    this.version(2)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
      })
      .upgrade(upgradeLegacyFsrs);

    // Version 3: add the automatic-backup restore-point store and a small key/value
    // store (for the optional File System Access folder handle), and backfill the
    // card fields introduced alongside tags/suspend/bury so existing data is clean.
    // Booleans are not valid IndexedDB keys, so `suspended` is filtered in memory,
    // not indexed.
    this.version(3)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
      })
      .upgrade(upgradeLegacyCardFlags);

    // Version 4: move embedded card images into a Blob asset table. Markdown keeps
    // only lacuna-asset://hash references, which keeps reactive card reads small.
    this.version(4)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
      })
      .upgrade((tx) => upgradeLegacyMarkdownAssets(tx, (hash) => db.assets.get(hash)));

    // Version 5: add folders for hierarchical deck grouping. Folders are nested
    // via parentId. Decks gain a folderId that links them into a folder.
    // New indexes are added on the decks table for fast folder-scoped queries.
    this.version(5).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
    });

    // Version 6: add explicit time zone tracking to decks so exam dates are
    // displayed in the original time zone even when the user moves between zones.
    // No index needed — timeZone is a display-only field.
    this.version(6).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
    });

    // Version 7: add advanced FSRS scheduling controls (enable_fuzz, maximum_interval,
    // learning_steps, relearning_steps) and leech settings (leechThreshold, leechAction).
    // Existing decks are backfilled with the new FSRS parameter defaults.
    this.version(7)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
      })
      .upgrade(upgradeLegacySchedulingControls);

    // Version 8: add daily review goal and session time limit per deck.
    // No new indexes needed; the fields are optional numeric values on the deck record.
    this.version(8).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
    });

    // Version 9: introduce the Course -> Lesson model alongside the existing
    // Deck/Folder model (additive; nothing is deleted). New stores are created
    // for courses, lessons, notes, lesson-card links, practice nodes and extra
    // course exam dates. The cards and sessionHistory indexes gain courseId (and
    // primaryLessonId for cards) so course-scoped queries are fast. The upgrade
    // folds every standalone deck into a single-lesson course and every folder
    // into a course whose decks become ordered lessons, then stamps the derived
    // courseId/primaryLessonId onto cards, session history and performance rows.
    this.version(9)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed',
        sessionHistory: '++id, deckId, courseId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
        courses: 'id, createdAt, examDate',
        lessons: 'id, courseId, orderIndex, createdAt',
        notes: 'id, lessonId, orderIndex, createdAt',
        lessonCards: 'id, lessonId, cardId',
        practiceNodes: 'id, courseId, position, createdAt',
        courseExamDates: 'id, courseId, examDate, createdAt',
      })
      .upgrade(upgradeLegacyCourses);

    // Version 10: add an optional per-course lesson-view-mode override (study
    // vs edit; see src/state/lessonViewMode.ts and src/course/lessonViewMode.ts).
    // No index needed — it's a display-only field read by LessonView. Undefined
    // on existing courses inherits the global default, so no upgrade is needed.
    this.version(10).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed',
      sessionHistory: '++id, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
      courses: 'id, createdAt, examDate',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      practiceNodes: 'id, courseId, position, createdAt',
      courseExamDates: 'id, courseId, examDate, createdAt',
    });

    // Version 11: add sequences for overlapping-cloze sequence learning. A
    // sequence generates ordinary FSRS cards, each anchored to a SequenceItem
    // via cards.sequenceItemId. Additive only — no upgrade() needed.
    this.version(11).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
      courses: 'id, createdAt, examDate',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      practiceNodes: 'id, courseId, position, createdAt',
      courseExamDates: 'id, courseId, examDate, createdAt',
      sequences: 'id, courseId, primaryLessonId, createdAt',
    });

    // Version 12: lesson teaching progress is lesson-scoped rather than inferred
    // from a card's FSRS state. Reviewed cards are backfilled for their primary
    // lesson only; display links do not prove that a card was taught there.
    // Note annotations are stored separately because they are device-local and
    // deliberately excluded from every backup/export format.
    this.version(12)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
        sessionHistory: '++id, deckId, courseId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
        courses: 'id, createdAt, examDate',
        lessons: 'id, courseId, orderIndex, createdAt',
        notes: 'id, lessonId, orderIndex, createdAt',
        lessonCards: 'id, lessonId, cardId',
        lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
        lessonCompletions: 'lessonId, completedAt',
        noteAnnotations: 'id, noteId, createdAt, updatedAt',
        practiceNodes: 'id, courseId, position, createdAt',
        practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
        courseExamDates: 'id, courseId, examDate, createdAt',
        sequences: 'id, courseId, primaryLessonId, createdAt',
      })
      .upgrade(upgradeLessonExposures);

    // Version 13: retire the 'typing' card type. Typed answering is now a global
    // Learn-mode presentation mode (src/state/answerInput.ts) that applies to any
    // eligible card, rather than a dedicated card type. Existing 'typing' cards fold
    // into 'front_back' — no other field changes, so no data is lost.
    this.version(13)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
        sessionHistory: '++id, deckId, courseId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
        courses: 'id, createdAt, examDate',
        lessons: 'id, courseId, orderIndex, createdAt',
        notes: 'id, lessonId, orderIndex, createdAt',
        lessonCards: 'id, lessonId, cardId',
        lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
        lessonCompletions: 'lessonId, completedAt',
        noteAnnotations: 'id, noteId, createdAt, updatedAt',
        practiceNodes: 'id, courseId, position, createdAt',
        practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
        courseExamDates: 'id, courseId, examDate, createdAt',
        sequences: 'id, courseId, primaryLessonId, createdAt',
      })
      .upgrade(upgradeTypedCards);

    // Version 14: unify the primary final exam and intermediate exam-date rows
    // as CourseAssessment records. Keep the old store for this one upgrade step
    // so its rows can be copied safely before version 15 removes it.
    this.version(14)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
        sessionHistory: '++id, deckId, courseId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
        courses: 'id, createdAt',
        lessons: 'id, courseId, orderIndex, createdAt',
        notes: 'id, lessonId, orderIndex, createdAt',
        lessonCards: 'id, lessonId, cardId',
        lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
        lessonCompletions: 'lessonId, completedAt',
        noteAnnotations: 'id, noteId, createdAt, updatedAt',
        practiceNodes: 'id, courseId, position, createdAt',
        practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
        courseExamDates: 'id, courseId, examDate, createdAt',
        courseAssessments: 'id, courseId, kind, examDate, createdAt',
        sequences: 'id, courseId, primaryLessonId, createdAt',
      })
      .upgrade(upgradeCourseAssessments);

    // Version 15: remove the retired course exam-date store after v14 has copied
    // every row. No application code reads or writes the old representation.
    this.version(15).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
      courses: 'id, createdAt',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
      lessonCompletions: 'lessonId, completedAt',
      noteAnnotations: 'id, noteId, createdAt, updatedAt',
      practiceNodes: 'id, courseId, position, createdAt',
      practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
      courseExamDates: null,
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      sequences: 'id, courseId, primaryLessonId, createdAt',
    });

    // Version 16: give each new review aggregate a unique stable event identity.
    // IndexedDB omits legacy rows without eventId from the index, so old session
    // history remains valid without fabricated provenance.
    this.version(16).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
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
    });

    // Version 17: persist one durable multi-day revision plan per assessment.
    this.version(17).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
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
    });

    // Version 18: classroom distribution (Arc 7 §7.2). `Course.distributedCopy`/
    // `Course.distribution` are new optional fields only, no index needed. Two new
    // tables: `lineageIdMappings` (the adopted-id membership registry for a
    // distributed course lineage) and `pendingMergeReviews` (queued merge decisions
    // awaiting student review). Purely additive — no `.upgrade()` data pass, same
    // pattern as sequences' schema v11.
    this.version(18).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
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
    });

    // Version 19: image occlusion (Arc 6 slice 2, §6.3). New table `occlusions`,
    // following the sequences precedent exactly, plus an `occlusionRegionId` index
    // on `cards` so generated occlusion cards can be looked up by owning region.
    // Purely additive — no `.upgrade()` data pass.
    this.version(19).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards:
        'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId, occlusionRegionId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
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
    });

    // Version 20: add the canonical review-event store. The migration copies every
    // existing Card.history row without changing the Card projection or runtime
    // readers/writers. Schema v26 later completes the persistence cutover after
    // backup, merge and undo have canonical-event coverage.
    this.version(20)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards:
          'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId, occlusionRegionId',
        sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
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
        reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, timestamp',
      })
      .upgrade(upgradeCanonicalReviewHistory);

    // Version 21: materialise the target domain-storage concepts without deleting
    // compatibility stores. Course/Lesson scheduling units and split performance
    // profiles are backfilled from the already-migrated Course rows, cards and
    // hidden backing Decks. Card and canonical-history rows receive the resolved
    // unit id so later slices can cut readers and writers over atomically.
    this.version(21)
      .stores({
        decks: 'id, createdAt, examDate, folderId',
        cards:
          'id, deckId, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed, sequenceItemId, occlusionRegionId',
        sessionHistory: '++id, &eventId, sessionId, deckId, courseId, schedulingUnitId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: 'id, parentId, createdAt',
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
      })
      .upgrade(upgradeDomainStorage);

    // Version 22: remove the hidden Deck and Folder compatibility stores. All
    // cards and review projections already carry explicit scheduling-unit ids.
    this.version(22)
      .stores({
        decks: null,
        cards:
          'id, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed, sequenceItemId, occlusionRegionId',
        sessionHistory: '++id, &eventId, sessionId, deckId, courseId, schedulingUnitId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
        folders: null,
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
      })
      .upgrade(validateLegacyStorageRemoval);

    // Version 23: mutation timestamps and deletion tombstones for multi-device
    // merge. Additive. updatedAt is a record field, not an index. Tombstones
    // are keyed by table + record id so a restore can delete the matching row.
    this.version(23)
      .stores({
        cards:
          'id, courseId, primaryLessonId, schedulingUnitId, type, lastReviewed, sequenceItemId, occlusionRegionId',
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
      })
      .upgrade(upgradeMutationTimestamps);

    // Version 24: separate direct-recall Cards from application Questions. Every
    // surviving Card receives a stable Concept; known numeric/working Cards become
    // fixed Questions with reconstructed legacy receipts. This is destructive in
    // meaning, so openDatabase requires an external restore point before Dexie runs it.
    this.version(24)
      .stores({
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
      })
      .upgrade(upgradeQuestionStorage);

    // Version 25: durable learner-correctable AI teaching context. Additive only.
    this.version(25).stores({
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
      agentMemories: 'id, courseId, status, updatedAt, *tags',
    });

    // Version 26: complete the review-event storage cutover. Every legacy inline
    // Card.history event is copied and verified in the canonical table before the
    // duplicate Card projection is cleared. The upgrade transaction is atomic, so
    // a failed verification preserves both the source projection and schema v25.
    this.version(26)
      .stores({
        cards:
          'id, courseId, primaryLessonId, schedulingUnitId, conceptId, type, lastReviewed, sequenceItemId, occlusionRegionId',
      })
      .upgrade(upgradeStoredReviewProjection);

    // Version 27: materialise the timestamp-only review projection by card. The
    // projection is derived from canonical history and is not part of backups.
    this.version(27).stores({ reviewActivity: 'cardId' }).upgrade(upgradeReviewActivity);

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
  // Older upgrade steps still need the inline events. The v26 upgrade copies
  // and verifies them before explicitly clearing the projection itself.
  if (transaction.idbtrans.mode !== 'versionchange') card.history = [];
});
db.cards.hook('updating', (_changes, _primaryKey, _card, transaction) =>
  transaction.idbtrans.mode === 'versionchange' ? undefined : { history: [] },
);
