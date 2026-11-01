import { makeId } from './schema';
import { migrateCardRecord, type LegacyCard } from './migrations';
import type { BackupFile, MediaAsset } from '@lacuna/core/db/types';
import {
  mergeReviewHistoryEntries,
  projectCardsForStorage,
  type ReviewHistoryEntry,
} from '@lacuna/core/db/reviewHistory';
import {
  buildCourseAssessmentMigration,
  courseToRecord,
  finalAssessmentForCourse,
  type LegacyCourseRecord,
} from './assessmentMigration';
import { backupAssetToMediaAsset, extractMarkdownAssets } from './assets';
import { projectBackupScheduling } from './backupSchedulingProjection';
import { normaliseQuestionBackup } from '../questions/backup';
import { mergeQuestionCollections } from '../questions/merge';
import { parseQuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import { assertQuestionSetReferences } from '../questions/questionSetMerge';
import { assertQuestionSetPracticeNodeReferences } from './questionSetPracticeNode';

export type ImportMode = 'replace' | 'merge';

function withUpdatedAt<T extends { updatedAt?: number }>(
  row: T,
  fallback: number,
): T & { updatedAt: number } {
  return typeof row.updatedAt === 'number'
    ? (row as T & { updatedAt: number })
    : { ...row, updatedAt: fallback };
}

/** Complete migration and asynchronous media preparation before the caller opens its write transaction. */
export async function prepareBackup(backup: BackupFile, mode: ImportMode) {
  backup = normaliseQuestionBackup(backup);
  let incomingQuestions = {
    concepts: backup.concepts ?? [],
    questions: backup.questions ?? [],
    questionConcepts: backup.questionConcepts ?? [],
    questionAttempts: backup.questionAttempts ?? [],
  };
  const incomingQuestionSets = (backup.questionSets ?? []).map(parseQuestionSetRecord);
  const incomingQuestionSetAttempts = (backup.questionSetAttempts ?? []).map(
    parseQuestionSetAttemptRecord,
  );

  // Pre-process markdown assets outside the IndexedDB transaction so long-running
  // canvas compressions cannot auto-abort the import transaction.
  const assets = backup.assets;
  const knownHashes = new Set(backup.assets.map((a) => a.hash.toLowerCase()));
  const extractedAssets: MediaAsset[] = [];
  const migratedCards = await Promise.all(
    backup.cards.map(async (c) => {
      const migrated = migrateCardRecord(c as LegacyCard);
      return {
        ...migrated,
        front: await extractMarkdownAssets(
          migrated.front,
          async (asset) => {
            extractedAssets.push(asset);
            knownHashes.add(asset.hash.toLowerCase());
          },
          knownHashes,
        ),
        back: await extractMarkdownAssets(
          migrated.back,
          async (asset) => {
            extractedAssets.push(asset);
            knownHashes.add(asset.hash.toLowerCase());
          },
          knownHashes,
        ),
      };
    }),
  );
  const notes = await Promise.all(
    (backup.notes ?? []).map(async (note) => ({
      ...note,
      content: await extractMarkdownAssets(
        note.content,
        async (asset) => {
          extractedAssets.push(asset);
          knownHashes.add(asset.hash.toLowerCase());
        },
        knownHashes,
      ),
    })),
  );
  const importedAssets = [...assets.map(backupAssetToMediaAsset), ...extractedAssets];
  const rawCourses = backup.courses ?? [];
  const currentAssessments = backup.courseAssessments;
  const assessmentMigration = currentAssessments
    ? {
        courses: rawCourses.map((course) =>
          'examDate' in course ? courseToRecord(course as LegacyCourseRecord) : course,
        ),
        assessments: currentAssessments,
      }
    : buildCourseAssessmentMigration(
        rawCourses as LegacyCourseRecord[],
        backup.lessons ?? [],
        backup.courseExamDates ?? [],
        makeId,
      );
  const adaptation = projectBackupScheduling(backup, {
    courses: assessmentMigration.courses,
    lessons: backup.lessons ?? [],
    courseAssessments: assessmentMigration.assessments,
    cards: migratedCards,
  });
  const { cards, courses, courseAssessments, ...storageProjection } = adaptation;
  for (const card of cards) {
    Object.assign(card, withUpdatedAt(card, Math.max(card.createdAt ?? 0, card.lastReviewed ?? 0)));
  }
  for (const course of courses) {
    Object.assign(course, withUpdatedAt(course, course.createdAt ?? 0));
  }
  for (const lesson of backup.lessons ?? []) {
    Object.assign(lesson, withUpdatedAt(lesson, lesson.createdAt ?? 0));
  }
  for (const note of notes) {
    Object.assign(note, withUpdatedAt(note, note.createdAt ?? 0));
  }
  for (const link of backup.lessonCards ?? []) {
    Object.assign(link, withUpdatedAt(link, link.createdAt ?? 0));
  }
  for (const exposure of backup.lessonCardExposures ?? []) {
    Object.assign(exposure, withUpdatedAt(exposure, exposure.taughtAt ?? 0));
  }
  for (const completion of backup.lessonCompletions ?? []) {
    Object.assign(completion, withUpdatedAt(completion, completion.completedAt ?? 0));
  }
  for (const node of backup.practiceNodes ?? []) {
    Object.assign(node, withUpdatedAt(node, node.createdAt ?? 0));
  }
  for (const assessment of courseAssessments) {
    Object.assign(assessment, withUpdatedAt(assessment, assessment.createdAt ?? 0));
  }
  for (const sequence of backup.sequences ?? []) {
    Object.assign(sequence, withUpdatedAt(sequence, sequence.createdAt ?? 0));
  }
  for (const occlusion of backup.occlusions ?? []) {
    Object.assign(occlusion, withUpdatedAt(occlusion, occlusion.createdAt ?? 0));
  }
  for (const unit of storageProjection.schedulingUnits) {
    Object.assign(
      unit,
      withUpdatedAt(unit, Math.max(unit.createdAt ?? 0, unit.lastInteractedAt ?? 0)),
    );
  }
  for (const row of storageProjection.coursePerformance) {
    Object.assign(row, withUpdatedAt(row, 0));
  }
  for (const row of storageProjection.schedulingPerformance) {
    Object.assign(row, withUpdatedAt(row, 0));
  }
  for (const course of courses) finalAssessmentForCourse(course.id, courseAssessments);
  const courseIds = new Set(courses.map((course) => course.id));
  const agentMemories = backup.agentMemories ?? [];
  if (mode === 'replace') {
    for (const memory of agentMemories) {
      if (memory.courseId !== null && !courseIds.has(memory.courseId)) {
        throw new Error('A Course-scoped memory refers to a Course missing from the backup.');
      }
    }
  }
  incomingQuestions = mergeQuestionCollections(
    { concepts: [], questions: [], questionConcepts: [], questionAttempts: [] },
    incomingQuestions,
    courses,
    [],
  );
  assertQuestionSetReferences(
    incomingQuestionSets,
    courses,
    backup.lessons ?? [],
    courseAssessments,
    incomingQuestions.concepts,
  );
  assertQuestionSetPracticeNodeReferences(
    backup.practiceNodes ?? [],
    courses,
    backup.lessons ?? [],
    incomingQuestionSets,
    backup.practiceMilestones ?? [],
  );
  const reviewHistory: ReviewHistoryEntry[] = mergeReviewHistoryEntries(
    backup.reviewHistory ?? [],
    cards,
  );
  const storedCards = projectCardsForStorage(cards);
  const hydratedReviewHistory = reviewHistory.map((entry) => ({
    ...entry,
    schedulingUnitId:
      entry.schedulingUnitId ?? storageProjection.schedulingUnitByCardId.get(entry.cardId),
  }));
  const reviewUnitByEventId = new Map(
    hydratedReviewHistory
      .filter((entry) => entry.eventId && entry.schedulingUnitId)
      .map((entry) => [entry.eventId!, entry.schedulingUnitId!]),
  );
  const sessionHistory = backup.sessionHistory.map((entry) => ({
    ...entry,
    schedulingUnitId:
      entry.schedulingUnitId ??
      (entry.eventId ? reviewUnitByEventId.get(entry.eventId) : undefined) ??
      storageProjection.schedulingUnitByDeckId.get(entry.deckId) ??
      (entry.courseId &&
      storageProjection.schedulingUnits.some((unit) => unit.id === entry.courseId)
        ? entry.courseId
        : undefined),
  }));
  // Deduplicate by hash so bulkPut never encounters a constraint conflict.
  const dedupedAssets = Array.from(new Map(importedAssets.map((a) => [a.hash, a])).values());
  return {
    backup,
    incomingQuestions,
    incomingQuestionSets,
    incomingQuestionSetAttempts,
    notes,
    cards,
    courses,
    courseAssessments,
    storageProjection,
    agentMemories,
    storedCards,
    hydratedReviewHistory,
    sessionHistory,
    dedupedAssets,
  };
}

export type PreparedBackup = Awaited<ReturnType<typeof prepareBackup>>;
