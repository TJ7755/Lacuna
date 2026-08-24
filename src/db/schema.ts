import Dexie, { type Table } from 'dexie';
import type {
  LegacyDeckRecord,
  Card,
  SessionHistoryEntry,
  UserPerformance,
  BackupFile,
  AppStateEntry,
  MediaAsset,
  BackupSnapshot,
  LegacyFolder,
  Course,
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
} from './types';
import { reviewHistoryEntriesForCard, type ReviewHistoryEntry } from './reviewHistory';
import {
  migrateCardRecord,
  migrateDeckRecord,
  buildLessonCardExposureBackfill,
  type LegacyCard,
  type LegacyDeck,
} from './migrations';
import { buildCourseMigration } from './courseMigration';
import { savePreMigrationSnapshot } from './preMigrationSnapshots';
import { blobToArrayBuffer, bytesToBase64 } from './assets';
import {
  buildCourseAssessmentMigration,
  type LegacyAssessmentRecord,
  type LegacyCourseRecord,
} from './assessmentMigration';
import { buildDomainStorageMigration } from './storageMigration';
import { migrateQuestionModeContent } from '../questions/domain';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';

/**
 * Write one migration batch while checking only the destination keys needed for
 * collision resolution. The destination table is the durable collision index, so
 * migration does not need to retain every historical event in JavaScript memory.
 */
async function putMigratedReviewHistoryEntries(
  table: Table<ReviewHistoryEntry, string>,
  entries: ReviewHistoryEntry[],
): Promise<void> {
  const identityOf = (entry: ReviewHistoryEntry): string => {
    const { id: _id, ...identity } = entry;
    return JSON.stringify(identity);
  };

  for (const entry of entries) {
    const identity = identityOf(entry);
    let id = entry.id;
    let existing = await table.get(id);
    if (existing) {
      if (identityOf(existing) === identity) continue;

      const suffix =
        existing.cardId === entry.cardId
          ? `${entry.id}:duplicate`
          : `${entry.id}:card:${encodeURIComponent(entry.cardId)}`;
      id = suffix;
      existing = await table.get(id);
      let collision = 1;
      while (existing) {
        if (identityOf(existing) === identity) {
          id = '';
          break;
        }
        id = `${suffix}:${collision++}`;
        existing = await table.get(id);
      }
      if (!id) continue;
    }
    await table.put({ ...entry, id });
  }
}

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
  schedulingUnits!: Table<SchedulingUnitRecord, string>;
  coursePerformance!: Table<CoursePerformance, string>;
  schedulingPerformance!: Table<SchedulingPerformance, string>;
  tombstones!: Table<Tombstone, [string, string]>;
  concepts!: Table<Concept, string>;
  questions!: Table<QuestionDefinition, string>;
  questionConcepts!: Table<QuestionConceptSet, string>;
  questionAttempts!: Table<QuestionAttempt, string>;

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
      .upgrade(async (tx) => {
        await tx
          .table('decks')
          .toCollection()
          .modify((deck) => {
            Object.assign(deck, migrateDeckRecord(deck as LegacyDeck));
          });
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            Object.assign(card, migrateCardRecord(card as LegacyCard));
          });
      });

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
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            Object.assign(card, migrateCardRecord(card as LegacyCard));
          });
      });

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
      .upgrade(async (tx) => {
        const { extractMarkdownAssets } = await import('./assets');
        // Process cards in small batches so we never load the whole table into
        // memory at once. Async extraction happens per-card, keeping the upgrade safe.
        const table = tx.table('cards');
        let offset = 0;
        const batchSize = 50;
        for (;;) {
          const batch = await table.offset(offset).limit(batchSize).toArray();
          if (batch.length === 0) break;
          for (const card of batch) {
            const front = await extractMarkdownAssets(card.front ?? '', (asset) =>
              tx.table('assets').put(asset),
            );
            const back = await extractMarkdownAssets(card.back ?? '', (asset) =>
              tx.table('assets').put(asset),
            );
            const migrated = { ...card, front, back };
            Object.assign(migrated, migrateCardRecord(migrated as LegacyCard));
            await table.put(migrated);
          }
          offset += batchSize;
        }
      });

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
      .upgrade(async (tx) => {
        await tx
          .table('decks')
          .toCollection()
          .modify((deck) => {
            Object.assign(deck, migrateDeckRecord(deck as LegacyDeck));
          });
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            Object.assign(card, migrateCardRecord(card as LegacyCard));
          });
      });

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
      .upgrade(async (tx) => {
        const decks = (await tx.table('decks').toArray()) as LegacyDeckRecord[];
        const folders = (await tx.table('folders').toArray()) as LegacyFolder[];
        const { courses, lessons, courseIdByDeckId, lessonIdByDeckId } = buildCourseMigration(
          decks,
          folders,
          makeId,
        );

        await tx.table('courses').bulkPut(courses);
        await tx.table('lessons').bulkPut(lessons);

        // Stamp the derived courseId/primaryLessonId onto every card.
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            const courseId = courseIdByDeckId.get(card.deckId);
            if (courseId !== undefined) {
              card.courseId = courseId;
              card.primaryLessonId = lessonIdByDeckId.get(card.deckId) ?? null;
            }
          });

        // Carry the derived courseId onto session history and performance rows.
        await tx
          .table('sessionHistory')
          .toCollection()
          .modify((entry) => {
            const courseId = courseIdByDeckId.get(entry.deckId);
            if (courseId !== undefined) entry.courseId = courseId;
          });
        await tx
          .table('userPerformance')
          .toCollection()
          .modify((perf) => {
            const courseId = courseIdByDeckId.get(perf.deckId);
            if (courseId !== undefined) perf.courseId = courseId;
          });
      });

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
      .upgrade(async (tx) => {
        const exposures = buildLessonCardExposureBackfill(
          (await tx.table('cards').toArray()) as Card[],
        );
        if (exposures.length > 0) {
          await tx.table('lessonCardExposures').bulkPut(exposures);
        }
      });

    // Version 13: retire the 'typing' card type. Typed answering is now a global
    // Learn-mode presentation mode (src/state/typingSetting.ts) that applies to any
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
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .where('type')
          .equals('typing')
          .modify((card) => {
            card.type = 'front_back';
          });
      });

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
      .upgrade(async (tx) => {
        const migration = buildCourseAssessmentMigration(
          (await tx.table('courses').toArray()) as LegacyCourseRecord[],
          (await tx.table('lessons').toArray()) as Lesson[],
          (await tx.table('courseExamDates').toArray()) as LegacyAssessmentRecord[],
          makeId,
        );
        await tx.table('courses').bulkPut(migration.courses);
        if (migration.assessments.length > 0) {
          await tx.table('courseAssessments').bulkPut(migration.assessments);
        }
      });

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
    // pattern as sequences' schema v11 (docs/archive/roadmap-2026-08-11.md §1.2).
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
    // readers/writers. Later slices will cut persistence and reads over behind an
    // adapter once backup and undo coverage is in place.
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
      .upgrade(async (tx) => {
        const cardsTable = tx.table('cards');
        const reviewHistoryTable = tx.table('reviewHistory');
        const batchSize = 100;
        // Resolve collisions against rows already written to the destination table.
        // This keeps migration memory bounded by the batch rather than retaining a
        // process-wide index of every migrated event.
        let offset = 0;
        for (;;) {
          const cards = await cardsTable.offset(offset).limit(batchSize).toArray();
          if (cards.length === 0) break;
          const entries = cards.flatMap((card) => reviewHistoryEntriesForCard(card as Card));
          await putMigratedReviewHistoryEntries(reviewHistoryTable, entries);
          offset += cards.length;
        }
      });

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
      .upgrade(async (tx) => {
        const migration = buildDomainStorageMigration(
          (await tx.table('courses').toArray()) as CourseRecord[],
          (await tx.table('lessons').toArray()) as Lesson[],
          (await tx.table('courseAssessments').toArray()) as CourseAssessment[],
          (await tx.table('decks').toArray()) as LegacyDeckRecord[],
          (await tx.table('cards').toArray()) as Card[],
          (await tx.table('userPerformance').toArray()) as UserPerformance[],
        );
        await tx.table('schedulingUnits').bulkPut(migration.schedulingUnits);
        await tx.table('coursePerformance').bulkPut(migration.coursePerformance);
        await tx.table('schedulingPerformance').bulkPut(migration.schedulingPerformance);

        await tx
          .table('cards')
          .toCollection()
          .modify((card) => {
            const schedulingUnitId = migration.schedulingUnitByCardId.get(card.id);
            if (schedulingUnitId) card.schedulingUnitId = schedulingUnitId;
          });
        const schedulingUnitIds = new Set(migration.schedulingUnits.map((unit) => unit.id));
        const reviewUnitByEventId = new Map<string, string>();
        for (const entry of (await tx.table('reviewHistory').toArray()) as ReviewHistoryEntry[]) {
          if (entry.eventId) {
            const schedulingUnitId = migration.schedulingUnitByCardId.get(entry.cardId);
            if (schedulingUnitId) reviewUnitByEventId.set(entry.eventId, schedulingUnitId);
          }
        }
        await tx
          .table('reviewHistory')
          .toCollection()
          .modify((entry) => {
            const schedulingUnitId = migration.schedulingUnitByCardId.get(entry.cardId);
            if (schedulingUnitId) entry.schedulingUnitId = schedulingUnitId;
          });
        await tx
          .table('sessionHistory')
          .toCollection()
          .modify((entry) => {
            const schedulingUnitId =
              (entry.eventId ? reviewUnitByEventId.get(entry.eventId) : undefined) ??
              migration.schedulingUnitByDeckId.get(entry.deckId) ??
              (entry.courseId && schedulingUnitIds.has(entry.courseId)
                ? entry.courseId
                : undefined);
            if (schedulingUnitId) entry.schedulingUnitId = schedulingUnitId;
          });
      });

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
      .upgrade(async (tx) => {
        const schedulingUnitIds = new Set<string>(
          (await tx.table('schedulingUnits').toCollection().primaryKeys()) as string[],
        );
        const cards = (await tx.table('cards').toArray()) as Card[];
        for (const card of cards) {
          if (!card.schedulingUnitId || !schedulingUnitIds.has(card.schedulingUnitId)) {
            throw new Error(
              `Cannot remove legacy storage: card ${card.id} has no valid scheduling unit`,
            );
          }
        }
      });

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
      .upgrade(async (tx) => {
        const stampFromCreated = async (name: string) => {
          await tx
            .table(name)
            .toCollection()
            .modify((row: { createdAt?: number; updatedAt?: number }) => {
              if (typeof row.updatedAt !== 'number') row.updatedAt = row.createdAt ?? 0;
            });
        };
        await stampFromCreated('courses');
        await stampFromCreated('lessons');
        await stampFromCreated('notes');
        await stampFromCreated('lessonCards');
        await stampFromCreated('practiceNodes');
        await stampFromCreated('courseAssessments');
        await stampFromCreated('sequences');
        await stampFromCreated('occlusions');
        await stampFromCreated('noteAnnotations');
        await stampFromCreated('revisionPlans');
        await tx
          .table('lessonCardExposures')
          .toCollection()
          .modify((row: { taughtAt?: number; updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') row.updatedAt = row.taughtAt ?? 0;
          });
        await tx
          .table('lessonCompletions')
          .toCollection()
          .modify((row: { completedAt?: number; updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') row.updatedAt = row.completedAt ?? 0;
          });
        await tx
          .table('cards')
          .toCollection()
          .modify(
            (row: { createdAt?: number; lastReviewed?: number | null; updatedAt?: number }) => {
              if (typeof row.updatedAt !== 'number') {
                row.updatedAt = Math.max(row.createdAt ?? 0, row.lastReviewed ?? 0);
              }
            },
          );
        await tx
          .table('schedulingUnits')
          .toCollection()
          .modify((row: { createdAt?: number; lastInteractedAt?: number; updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') {
              row.updatedAt = Math.max(row.createdAt ?? 0, row.lastInteractedAt ?? 0);
            }
          });
        await tx
          .table('coursePerformance')
          .toCollection()
          .modify((row: { updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
          });
        await tx
          .table('schedulingPerformance')
          .toCollection()
          .modify((row: { updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
          });
        await tx
          .table('practiceMilestones')
          .toCollection()
          .modify((row: { updatedAt?: number }) => {
            if (typeof row.updatedAt !== 'number') row.updatedAt = 0;
          });
      });

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
      .upgrade(async (tx) => {
        const cards = await tx.table('cards').toArray();
        const reviewHistory = (await tx.table('reviewHistory').toArray()) as ReviewHistoryEntry[];
        const lessonCardLinks = (await tx.table('lessonCards').toArray()) as LessonCardLink[];
        const exposures = (await tx.table('lessonCardExposures').toArray()) as LessonCardExposure[];
        const lineageMappings = (await tx
          .table('lineageIdMappings')
          .toArray()) as LineageIdMapping[];
        const pendingReviews = (await tx
          .table('pendingMergeReviews')
          .toArray()) as PendingMergeReview[];

        // A structured Card participating in unresolved distributed-course state cannot
        // be translated without also changing the lineage protocol. Preserve it as a
        // compatibility Card until that merge is resolved instead of losing the work.
        const protectedCardIds = new Set(lineageMappings.flatMap((mapping) => mapping.cardIds));
        for (const pending of pendingReviews) {
          pending.diff.creates.cards.forEach((card) => protectedCardIds.add(card.id));
          pending.diff.updates.cards.forEach((update) => protectedCardIds.add(update.id));
          pending.diff.removals.cardIds.forEach((id) => protectedCardIds.add(id));
          pending.diff.conflicts.forEach((conflict) => {
            if (conflict.kind === 'card') protectedCardIds.add(conflict.entityId);
          });
        }

        const migration = migrateQuestionModeContent({
          cards,
          reviewHistory,
          lessonCardLinks,
          protectedCardIds,
        });

        await tx.table('concepts').bulkPut(migration.concepts);
        await tx.table('questions').bulkPut(migration.questions);
        await tx.table('questionConcepts').bulkPut(migration.questionConcepts);
        await tx.table('questionAttempts').bulkPut(migration.attempts);
        await tx.table('cards').bulkPut(migration.cards);

        const removed = new Set(migration.removedCardIds);
        const removedReviews = reviewHistory.filter((entry) => removed.has(entry.cardId));
        const removedExposures = exposures.filter((entry) => removed.has(entry.cardId));
        const removedLinks = lessonCardLinks.filter((entry) => removed.has(entry.cardId));
        await tx.table('cards').bulkDelete(migration.removedCardIds);
        await tx.table('reviewHistory').bulkDelete(migration.removedReviewHistoryIds);
        await tx.table('lessonCards').bulkDelete(removedLinks.map((entry) => entry.id));
        await tx
          .table('lessonCardExposures')
          .bulkDelete(removedExposures.map((entry) => [entry.lessonId, entry.cardId]));

        const removedEventIds = new Set(
          removedReviews.flatMap((entry) => (entry.eventId ? [entry.eventId] : [])),
        );
        if (removedEventIds.size > 0) {
          await tx
            .table('sessionHistory')
            .filter(
              (entry: SessionHistoryEntry) =>
                typeof entry.eventId === 'string' && removedEventIds.has(entry.eventId),
            )
            .delete();
        }

        if (removed.size > 0) {
          await tx
            .table('courseAssessments')
            .toCollection()
            .modify((assessment: CourseAssessment) => {
              assessment.excludedCardIds = (assessment.excludedCardIds ?? []).filter(
                (id) => !removed.has(id),
              );
            });
          await tx
            .table('revisionPlans')
            .toCollection()
            .modify((plan: RevisionPlan) => {
              if (!plan.scope || !Array.isArray(plan.cardStates)) return;
              plan.scope.excludedCardIds = (plan.scope.excludedCardIds ?? []).filter(
                (id) => !removed.has(id),
              );
              plan.scope.eligibleCardIds = (plan.scope.eligibleCardIds ?? []).filter(
                (id) => !removed.has(id),
              );
              plan.scope.unavailableCardIds = (plan.scope.unavailableCardIds ?? []).filter(
                (id) => !removed.has(id),
              );
              plan.cardStates = plan.cardStates.filter((state) => !removed.has(state.cardId));
              if (plan.pendingReplan?.scope && Array.isArray(plan.pendingReplan.cardStates)) {
                plan.pendingReplan.scope.excludedCardIds = (
                  plan.pendingReplan.scope.excludedCardIds ?? []
                ).filter((id) => !removed.has(id));
                plan.pendingReplan.scope.eligibleCardIds = (
                  plan.pendingReplan.scope.eligibleCardIds ?? []
                ).filter((id) => !removed.has(id));
                plan.pendingReplan.scope.unavailableCardIds = (
                  plan.pendingReplan.scope.unavailableCardIds ?? []
                ).filter((id) => !removed.has(id));
                plan.pendingReplan.cardStates = plan.pendingReplan.cardStates.filter(
                  (state) => !removed.has(state.cardId),
                );
              }
            });
        }

        const affectedCourseIds = new Set(
          cards.flatMap((card) => (removed.has(card.id) && card.courseId ? [card.courseId] : [])),
        );
        const affectedSchedulingUnitIds = new Set(
          cards.flatMap((card) =>
            removed.has(card.id) && card.schedulingUnitId ? [card.schedulingUnitId] : [],
          ),
        );
        const removedMilestones = (
          (await tx.table('practiceMilestones').toArray()) as PracticeMilestone[]
        ).filter((milestone) => affectedCourseIds.has(milestone.courseId));
        await tx
          .table('practiceMilestones')
          .bulkDelete(removedMilestones.map((milestone) => milestone.nodeKey));

        const remainingReviews = reviewHistory.filter((entry) => !removed.has(entry.cardId));
        const performance = (entries: ReviewHistoryEntry[]) => {
          let count = 0;
          let mean = 0;
          let m2 = 0;
          for (const entry of entries) {
            if (!(entry.correct ?? entry.grade > 1) || !Number.isFinite(entry.responseTimeSec))
              continue;
            count += 1;
            const delta = entry.responseTimeSec - mean;
            mean += delta / count;
            m2 += delta * (entry.responseTimeSec - mean);
          }
          return {
            runningMeanResponseTime: mean,
            runningStdDevResponseTime: count > 0 ? Math.sqrt(m2 / count) : 0,
            m2,
            totalCorrectReviews: count,
          };
        };
        await tx
          .table('coursePerformance')
          .toCollection()
          .modify((row: CoursePerformance) => {
            if (!affectedCourseIds.has(row.courseId)) return;
            Object.assign(
              row,
              performance(remainingReviews.filter((entry) => entry.courseId === row.courseId)),
            );
          });
        await tx
          .table('schedulingPerformance')
          .toCollection()
          .modify((row: SchedulingPerformance) => {
            if (!affectedSchedulingUnitIds.has(row.schedulingUnitId)) return;
            Object.assign(
              row,
              performance(
                remainingReviews.filter((entry) => entry.schedulingUnitId === row.schedulingUnitId),
              ),
            );
          });

        const tombstones: Tombstone[] = [
          ...migration.removedCardIds.map((id) => {
            const source = cards.find((card) => card.id === id);
            return {
              table: 'cards',
              recordId: id,
              deletedAt: source?.updatedAt ?? source?.createdAt ?? 0,
            };
          }),
          ...removedLinks.map((entry) => ({
            table: 'lessonCards',
            recordId: entry.id,
            deletedAt: entry.updatedAt ?? entry.createdAt,
          })),
          ...removedExposures.map((entry) => ({
            table: 'lessonCardExposures',
            recordId: `${entry.lessonId}:${entry.cardId}`,
            deletedAt: entry.updatedAt ?? entry.taughtAt,
          })),
          ...removedMilestones.map((entry) => ({
            table: 'practiceMilestones',
            recordId: entry.nodeKey,
            deletedAt: entry.updatedAt,
          })),
        ];
        await tx.table('tombstones').bulkPut(tombstones);
      });
  }
}

const CURRENT_SCHEMA_VERSION = 24;
const DESTRUCTIVE_SCHEMA_VERSIONS = new Set([22, 24]);

export const db = new LacunaDatabase();

/** Possible outcomes when trying to open the database. */
export type DbOpenResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'corrupt' | 'blocked' | 'unknown'; message: string };

/**
 * Explicitly open the database so that corruption or quota errors surface early,
 * before any data operation runs. Dexie auto-opens on first query, which would
 * surface the error somewhere deep in the component tree; calling open() here
 * lets the UI show a clear failure screen instead.
 */
export async function openDatabase(): Promise<DbOpenResult> {
  try {
    await db.open();
    void import('./tombstonePrune')
      .then(({ pruneExpiredTombstones }) => pruneExpiredTombstones())
      .catch(() => undefined);
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      return {
        ok: false,
        reason: 'quota',
        message:
          'Your browser storage is full. Lacuna needs space to save your cards and progress. Free up disk space, or if you are in private browsing mode, switch to a normal window.',
      };
    }
    if (err instanceof DOMException && err.name === 'VersionError') {
      return {
        ok: false,
        reason: 'corrupt',
        message:
          'The local database appears to be from a newer version of Lacuna. Please refresh the page, or export a backup from the newer version and import it here.',
      };
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        reason: 'corrupt',
        message:
          'The local database could not be opened — it may be corrupted. Try exporting your data from Settings if you can access it, then reset the app storage.',
      };
    }
    if (err instanceof Error && err.message?.includes('blocked')) {
      return {
        ok: false,
        reason: 'blocked',
        message:
          'Lacuna is already open in another tab or window. Close the other instance and try again.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      message: `Failed to open the local database: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function getCurrentDbVersion(name: string): Promise<number> {
  if ('databases' in indexedDB) {
    try {
      const dbs = await indexedDB.databases();
      const db = dbs.find((d) => d.name === name);
      return db?.version ? db.version / 10 : 0;
    } catch {
      // Fall through to raw open fallback.
    }
  }

  // Some browsers do not expose indexedDB.databases(). Opening without a version
  // reads an existing database without upgrading it. If the name is new, the open
  // creates a temporary v1 database; remove that probe before reporting no data.
  return new Promise((resolve, reject) => {
    let createdByProbe = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = (event) => {
      createdByProbe = (event as IDBVersionChangeEvent).oldVersion === 0;
    };
    request.onsuccess = () => {
      const opened = request.result;
      const version = opened.version;
      opened.close();
      if (!createdByProbe) {
        resolve(version / 10);
        return;
      }

      const deletion = indexedDB.deleteDatabase(name);
      deletion.onsuccess = () => resolve(0);
      deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () =>
        reject(new Error('Temporary database probe could not be removed because it is blocked'));
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database version probe is blocked'));
  });
}

export async function readAllDataFromVersion(
  name: string,
  expectedVersion?: number,
): Promise<BackupFile> {
  const raw = await new Promise<{
    version: number;
    data: Record<string, unknown[]>;
  }>((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const idb = req.result;
      const stores = Array.from(idb.objectStoreNames);
      const result: Record<string, unknown[]> = {};

      if (stores.length === 0) {
        idb.close();
        resolve({ version: idb.version, data: result });
        return;
      }

      const tx = idb.transaction(stores, 'readonly');
      let pending = stores.length;
      let failed = false;

      for (const storeName of stores) {
        const storeReq = tx.objectStore(storeName).getAll();
        storeReq.onsuccess = (e) => {
          if (failed) return;
          result[storeName] = (e.target as IDBRequest).result;
          pending--;
          if (pending === 0) {
            idb.close();
            resolve({ version: idb.version, data: result });
          }
        };
        storeReq.onerror = () => {
          if (failed) return;
          failed = true;
          idb.close();
          reject(storeReq.error);
        };
      }

      tx.onerror = () => {
        if (failed) return;
        failed = true;
        idb.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another connection'));
  });

  const schemaVersion = raw.version / 10;
  if (expectedVersion !== undefined && schemaVersion !== expectedVersion) {
    throw new Error(
      `Database version mismatch: expected ${expectedVersion}, found ${schemaVersion}`,
    );
  }

  const assetsRaw = (raw.data['assets'] ?? []) as MediaAsset[];
  const assets = await Promise.all(
    assetsRaw.map(async (a) => {
      const buf = new Uint8Array(await blobToArrayBuffer(a.blob));
      return {
        hash: a.hash,
        data: bytesToBase64(buf),
        mimeType: a.mimeType,
        width: a.width,
        height: a.height,
        createdAt: a.createdAt,
      };
    }),
  );

  const payload: BackupFile = {
    app: 'lacuna',
    version: schemaVersion,
    exportedAt: Date.now(),
    decks: (raw.data['decks'] ?? []) as LegacyDeck[],
    cards: (raw.data['cards'] ?? []) as Card[],
    assets,
    sessionHistory: (raw.data['sessionHistory'] ?? []) as SessionHistoryEntry[],
    userPerformance: (raw.data['userPerformance'] ?? []) as UserPerformance[],
    folders: (raw.data['folders'] ?? []) as LegacyFolder[],
    courses: (raw.data['courses'] ?? []) as Course[],
    lessons: (raw.data['lessons'] ?? []) as Lesson[],
    notes: (raw.data['notes'] ?? []) as Note[],
    lessonCards: (raw.data['lessonCards'] ?? []) as LessonCardLink[],
    lessonCardExposures: (raw.data['lessonCardExposures'] ?? []) as LessonCardExposure[],
    lessonCompletions: (raw.data['lessonCompletions'] ?? []) as LessonCompletion[],
    practiceNodes: (raw.data['practiceNodes'] ?? []) as PracticeNode[],
    practiceMilestones: (raw.data['practiceMilestones'] ?? []) as PracticeMilestone[],
    courseAssessments: (raw.data['courseAssessments'] ?? []) as CourseAssessment[],
    revisionPlans: (raw.data['revisionPlans'] ?? []) as RevisionPlan[],
    reviewHistory: (raw.data['reviewHistory'] ?? []) as ReviewHistoryEntry[],
    schedulingUnits: (raw.data['schedulingUnits'] ?? []) as SchedulingUnitRecord[],
    coursePerformance: (raw.data['coursePerformance'] ?? []) as CoursePerformance[],
    schedulingPerformance: (raw.data['schedulingPerformance'] ?? []) as SchedulingPerformance[],
    sequences: (raw.data['sequences'] ?? []) as Sequence[],
    occlusions: (raw.data['occlusions'] ?? []) as Occlusion[],
    tombstones: (raw.data['tombstones'] ?? []) as Tombstone[],
    concepts: (raw.data['concepts'] ?? []) as Concept[],
    questions: (raw.data['questions'] ?? []) as QuestionDefinition[],
    questionConcepts: (raw.data['questionConcepts'] ?? []) as QuestionConceptSet[],
    questionAttempts: (raw.data['questionAttempts'] ?? []) as QuestionAttempt[],
    lineageIdMappings: (raw.data['lineageIdMappings'] ?? []) as LineageIdMapping[],
    pendingMergeReviews: (raw.data['pendingMergeReviews'] ?? []) as PendingMergeReview[],
  };

  // A v13 pre-migration snapshot must retain the retired store byte-for-byte.
  // It remains an extra legacy property until the later portability task owns
  // explicit old-backup import semantics.
  const legacyAssessments = (raw.data['courseExamDates'] ?? []) as LegacyAssessmentRecord[];
  if (legacyAssessments.length > 0) {
    payload.courseExamDates = legacyAssessments;
  }
  return payload;
}

// Cache the in-flight snapshot promise so concurrent calls await the same
// operation instead of racing or skipping.
const snapshotPromises = new Map<string, Promise<void>>();

export async function capturePreMigrationSnapshot(
  dbName: string,
  targetVersion: number,
  saveSnapshot: typeof savePreMigrationSnapshot = savePreMigrationSnapshot,
): Promise<void> {
  const currentVersion = await getCurrentDbVersion(dbName);
  if (currentVersion === 0 || currentVersion >= targetVersion) return;

  const payload = await readAllDataFromVersion(dbName, currentVersion);
  await saveSnapshot(targetVersion, payload);
}

/**
 * Detect a pending schema upgrade and, if one is pending, capture a full
 * pre-migration snapshot in a separate committed transaction before the
 * destructive migration runs. The snapshot is written to the dedicated
 * `lacuna-pre-migration` database so it survives even if the main upgrade
 * aborts and rolls back.
 *
 * Concurrent calls for the same database name coalesce into a single snapshot
 * operation rather than racing each other.
 */
export async function ensurePreMigrationSnapshot(
  dbName: string = 'lacuna',
  targetVersion: number = CURRENT_SCHEMA_VERSION,
  saveSnapshot: typeof savePreMigrationSnapshot = savePreMigrationSnapshot,
): Promise<void> {
  const snapshotKey = `${dbName}:${targetVersion}`;
  const existing = snapshotPromises.get(snapshotKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      await capturePreMigrationSnapshot(dbName, targetVersion, saveSnapshot);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Pre-migration snapshot failed:', e);
      // Remove from cache so a future call can retry. Destructive upgrades
      // propagate the failure to every caller sharing this promise.
      snapshotPromises.delete(snapshotKey);
      if (DESTRUCTIVE_SCHEMA_VERSIONS.has(targetVersion)) throw e;
    }
  })();

  snapshotPromises.set(snapshotKey, promise);
  return promise;
}

/** Generate a stable, collision-resistant identifier without external dependencies. */
export function makeId(): string {
  if (typeof crypto !== 'undefined') {
    try {
      return crypto.randomUUID();
    } catch {
      // randomUUID is unavailable in this runtime.
    }
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // UUID v4: version nibble = 4, variant bits = 10.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // getRandomValues is unavailable in this runtime.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
