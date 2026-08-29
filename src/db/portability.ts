// Import/Export: the entire database serialises to a single JSON file and back.

import { db, makeId } from './schema';
import { migrateCardRecord, type LegacyCard } from './migrations';
import type {
  BackupFile,
  Card,
  CourseAssessment,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  Occlusion,
  PracticeNode,
  PracticeMilestone,
  Sequence,
  SessionHistoryEntry,
  UserPerformance,
  MediaAsset,
  RevisionPlan,
  SchedulingUnitRecord,
  CoursePerformance,
  SchedulingPerformance,
  Tombstone,
  AgentMemory,
} from './types';
import { isAgentMemory } from './agentMemoryRecord';
import {
  mergeReviewHistoryEntries,
  resolveReviewHistoryCollisions,
  type ReviewHistoryCollisionState,
  type ReviewHistoryEntry,
} from './reviewHistory';
import {
  buildCourseAssessmentMigration,
  courseToRecord,
  finalAssessmentForCourse,
  type LegacyCourseRecord,
} from './assessmentMigration';
import {
  assetsForBackup,
  backupAssetToMediaAsset,
  extractMarkdownAssets,
  referencedAssetHashes,
  referencedAssetHashesInCards,
  referencedAssetHashesInValues,
} from './assets';
import { mergeRevisionPlans } from '../course/revisionPlan';
import { itemPayloadIsValid } from '../items/payloadValidation';
import { adaptLegacyBackup } from './legacyBackupAdapter';
import { normaliseQuestionBackup } from '../questions/backup';
import { mergeQuestionCollections } from '../questions/merge';

export const BACKUP_VERSION = 11;

function withUpdatedAt<T extends { updatedAt?: number }>(
  row: T,
  fallback: number,
): T & { updatedAt: number } {
  return typeof row.updatedAt === 'number'
    ? (row as T & { updatedAt: number })
    : { ...row, updatedAt: fallback };
}

/** Gather the whole database into a single backup object. */
export async function exportDatabase(): Promise<BackupFile> {
  const [
    cards,
    sessionHistory,
    courses,
    lessons,
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    sequences,
    occlusions,
    revisionPlans,
    reviewHistory,
    schedulingUnits,
    coursePerformance,
    schedulingPerformance,
    tombstones,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
  ] = await Promise.all([
    db.cards.toArray(),
    db.sessionHistory.toArray(),
    db.courses.toArray(),
    db.lessons.toArray(),
    db.notes.toArray(),
    db.lessonCards.toArray(),
    db.lessonCardExposures.toArray(),
    db.lessonCompletions.toArray(),
    db.practiceNodes.toArray(),
    db.practiceMilestones.toArray(),
    db.courseAssessments.toArray(),
    db.sequences.toArray(),
    db.occlusions.toArray(),
    db.revisionPlans.toArray(),
    db.reviewHistory.toArray(),
    db.schedulingUnits.toArray(),
    db.coursePerformance.toArray(),
    db.schedulingPerformance.toArray(),
    db.tombstones.toArray(),
    db.concepts.toArray(),
    db.questions.toArray(),
    db.questionConcepts.toArray(),
    db.questionAttempts.toArray(),
    db.lineageIdMappings.toArray(),
    db.pendingMergeReviews.toArray(),
    db.agentMemories.toArray(),
  ]);
  const projectedCards = cards;
  const referencedHashes = new Set(referencedAssetHashesInCards(projectedCards));
  for (const note of notes) {
    for (const hash of referencedAssetHashes(note.content)) referencedHashes.add(hash);
  }
  // An occlusion's diagram is referenced solely by `Occlusion.assetHash` — its generated
  // cards carry a plain-text fallback, not a Markdown embed — so it must be gathered
  // explicitly or a backup would restore occlusions with no image (mirrors assets.ts's GC).
  for (const occlusion of occlusions) referencedHashes.add(occlusion.assetHash);
  referencedAssetHashesInValues(questions, questionAttempts).forEach((hash) =>
    referencedHashes.add(hash),
  );
  const assets = await assetsForBackup([...referencedHashes]);
  return {
    app: 'lacuna',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    cards: projectedCards,
    assets,
    sessionHistory,
    userPerformance: [],
    courses,
    lessons,
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    sequences,
    occlusions,
    revisionPlans,
    reviewHistory: mergeReviewHistoryEntries(reviewHistory, projectedCards),
    schedulingUnits,
    coursePerformance,
    schedulingPerformance,
    tombstones,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
  };
}

/** Trigger a browser download of the backup as a timestamped JSON file. */
export async function downloadBackup(): Promise<void> {
  const data = await exportDatabase();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lacuna-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Validate that an unknown parsed object is a Lacuna backup file. */
export function validateBackup(data: unknown): data is BackupFile {
  if (typeof data !== 'object' || data === null) return false;
  const b = data as Partial<BackupFile>;
  const cardsHaveValidPayloads =
    Array.isArray(b.cards) &&
    b.cards.every((card) => {
      if (typeof card !== 'object' || card === null) return false;
      const candidate = card as Card;
      return (
        itemPayloadIsValid(candidate.payload) &&
        (candidate.payload === undefined || candidate.type === 'front_back')
      );
    });
  const hasCurrentQuestionCollections =
    typeof b.version === 'number' &&
    (b.version < 11 ||
      (Array.isArray(b.concepts) &&
        Array.isArray(b.questions) &&
        Array.isArray(b.questionConcepts) &&
        Array.isArray(b.questionAttempts)));
  return (
    b.app === 'lacuna' &&
    typeof b.version === 'number' &&
    (b.decks === undefined || Array.isArray(b.decks)) &&
    Array.isArray(b.cards) &&
    cardsHaveValidPayloads &&
    hasCurrentQuestionCollections &&
    Array.isArray(b.assets) &&
    Array.isArray(b.sessionHistory) &&
    Array.isArray(b.userPerformance) &&
    (b.tombstones === undefined || Array.isArray(b.tombstones)) &&
    (b.agentMemories === undefined ||
      (Array.isArray(b.agentMemories) && b.agentMemories.every(isAgentMemory)))
  );
}

export type ImportMode = 'replace' | 'merge';

export const PRE_V22_BACKUP_MESSAGE =
  'This backup predates schema v22 and can no longer be imported.';

/** True when the file still carries Deck or Folder rows from before schema v22. */
export function isPreV22Backup(backup: BackupFile): boolean {
  return (backup.decks?.length ?? 0) > 0 || (backup.folders?.length ?? 0) > 0;
}

function assertCurrentBackup(backup: BackupFile): void {
  if (isPreV22Backup(backup)) {
    throw new Error(PRE_V22_BACKUP_MESSAGE);
  }
}

/**
 * Import a backup. In "replace" mode the database is cleared first; in "merge" mode
 * records are matched by id and the most recently touched copy wins each conflict.
 * SessionHistory is append-only and de-duplicated by stable event identity when
 * available, falling back to (timestamp, deckId) for legacy rows.
 */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  if (!validateBackup(backup)) {
    throw new Error('Invalid backup file.');
  }
  assertCurrentBackup(backup);
  backup = normaliseQuestionBackup(backup);
  let incomingQuestions = {
    concepts: backup.concepts ?? [],
    questions: backup.questions ?? [],
    questionConcepts: backup.questionConcepts ?? [],
    questionAttempts: backup.questionAttempts ?? [],
  };

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
  const adaptation = adaptLegacyBackup(backup, {
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
  const reviewHistory: ReviewHistoryEntry[] = mergeReviewHistoryEntries(
    backup.reviewHistory ?? [],
    cards,
  );
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
  await db.transaction(
    'rw',
    [
      db.cards,
      db.sessionHistory,
      db.userPerformance,
      db.assets,
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
      db.sequences,
      db.occlusions,
      db.revisionPlans,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.tombstones,
      db.concepts,
      db.questions,
      db.questionConcepts,
      db.questionAttempts,
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
    ],
    async () => {
      // Deduplicate by hash so bulkPut never encounters a constraint conflict.
      const dedupedAssets = Array.from(new Map(importedAssets.map((a) => [a.hash, a])).values());
      if (mode === 'replace') {
        await Promise.all([
          db.cards.clear(),
          db.sessionHistory.clear(),
          db.userPerformance.clear(),
          db.assets.clear(),
          db.courses.clear(),
          db.lessons.clear(),
          db.notes.clear(),
          db.noteAnnotations.clear(),
          db.lessonCards.clear(),
          db.lessonCardExposures.clear(),
          db.lessonCompletions.clear(),
          db.practiceNodes.clear(),
          db.practiceMilestones.clear(),
          db.courseAssessments.clear(),
          db.sequences.clear(),
          db.occlusions.clear(),
          db.revisionPlans.clear(),
          db.reviewHistory.clear(),
          db.schedulingUnits.clear(),
          db.coursePerformance.clear(),
          db.schedulingPerformance.clear(),
          db.tombstones.clear(),
          db.concepts.clear(),
          db.questions.clear(),
          db.questionConcepts.clear(),
          db.questionAttempts.clear(),
          db.lineageIdMappings.clear(),
          db.pendingMergeReviews.clear(),
          db.agentMemories.clear(),
        ]);
        await db.cards.bulkAdd(cards);
        if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);
        await db.userPerformance.bulkAdd(backup.userPerformance);
        // Drop incoming auto-increment ids so they are reassigned cleanly.
        await db.sessionHistory.bulkAdd(
          sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
        );
        // Restore course-architecture tables if present in the backup.
        if (courses.length > 0) {
          await db.courses.bulkAdd(courses);
        }
        if (backup.lessons && backup.lessons.length > 0) {
          await db.lessons.bulkAdd(backup.lessons);
        }
        if (notes.length > 0) {
          await db.notes.bulkAdd(notes);
        }
        if (backup.lessonCards && backup.lessonCards.length > 0) {
          await db.lessonCards.bulkAdd(backup.lessonCards);
        }
        if (backup.lessonCardExposures && backup.lessonCardExposures.length > 0) {
          await db.lessonCardExposures.bulkAdd(backup.lessonCardExposures);
        }
        if (backup.lessonCompletions && backup.lessonCompletions.length > 0) {
          await db.lessonCompletions.bulkAdd(backup.lessonCompletions);
        }
        if (backup.practiceNodes && backup.practiceNodes.length > 0) {
          await db.practiceNodes.bulkAdd(backup.practiceNodes);
        }
        if (backup.practiceMilestones && backup.practiceMilestones.length > 0) {
          await db.practiceMilestones.bulkAdd(backup.practiceMilestones);
        }
        if (courseAssessments.length > 0) {
          await db.courseAssessments.bulkAdd(courseAssessments);
        }
        if (backup.sequences && backup.sequences.length > 0) {
          await db.sequences.bulkAdd(backup.sequences);
        }
        if (backup.occlusions && backup.occlusions.length > 0) {
          await db.occlusions.bulkAdd(backup.occlusions);
        }
        if (backup.revisionPlans && backup.revisionPlans.length > 0) {
          await db.revisionPlans.bulkAdd(backup.revisionPlans);
        }
        if (hydratedReviewHistory.length > 0) {
          await db.reviewHistory.bulkPut(hydratedReviewHistory);
        }
        if (storageProjection.schedulingUnits.length > 0) {
          await db.schedulingUnits.bulkPut(storageProjection.schedulingUnits);
        }
        if (storageProjection.coursePerformance.length > 0) {
          await db.coursePerformance.bulkPut(storageProjection.coursePerformance);
        }
        if (storageProjection.schedulingPerformance.length > 0) {
          await db.schedulingPerformance.bulkPut(storageProjection.schedulingPerformance);
        }
        if (backup.tombstones && backup.tombstones.length > 0) {
          await db.tombstones.bulkAdd(backup.tombstones);
        }
        if (incomingQuestions.concepts.length > 0) {
          await db.concepts.bulkAdd(incomingQuestions.concepts);
        }
        if (incomingQuestions.questions.length > 0) {
          await db.questions.bulkAdd(incomingQuestions.questions);
        }
        if (incomingQuestions.questionConcepts.length > 0) {
          await db.questionConcepts.bulkAdd(incomingQuestions.questionConcepts);
        }
        if (incomingQuestions.questionAttempts.length > 0) {
          await db.questionAttempts.bulkAdd(incomingQuestions.questionAttempts);
        }
        if (backup.lineageIdMappings && backup.lineageIdMappings.length > 0) {
          await db.lineageIdMappings.bulkAdd(backup.lineageIdMappings);
        }
        if (backup.pendingMergeReviews && backup.pendingMergeReviews.length > 0) {
          await db.pendingMergeReviews.bulkAdd(backup.pendingMergeReviews);
        }
        if (agentMemories.length > 0) await db.agentMemories.bulkAdd(agentMemories);
        return;
      }

      const existingCourses = new Map((await db.courses.toArray()).map((c) => [c.id, c]));
      const incomingCourses = new Map(courses.map((c) => [c.id, c]));
      if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);

      // Merge course-architecture tables: add incoming rows that don't exist locally,
      // preferring the newer record (by createdAt) when both sides have the same id.
      if (courses.length > 0) {
        const mergedCourses: CourseRecord[] = [];
        for (const incoming of courses) {
          const existing = existingCourses.get(incoming.id);
          if (!existing) {
            mergedCourses.push(incoming);
          } else {
            mergedCourses.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.courses.bulkPut(mergedCourses);
      }

      const localQuestionState = {
        concepts: await db.concepts.toArray(),
        questions: await db.questions.toArray(),
        questionConcepts: await db.questionConcepts.toArray(),
        questionAttempts: await db.questionAttempts.toArray(),
      };
      const mergedQuestionState = mergeQuestionCollections(
        localQuestionState,
        incomingQuestions,
        await db.courses.toArray(),
        [],
      );
      if (mergedQuestionState.concepts.length > 0) {
        await db.concepts.bulkPut(mergedQuestionState.concepts);
      }
      if (mergedQuestionState.questions.length > 0) {
        await db.questions.bulkPut(mergedQuestionState.questions);
      }
      if (mergedQuestionState.questionConcepts.length > 0) {
        await db.questionConcepts.bulkPut(mergedQuestionState.questionConcepts);
      }
      if (mergedQuestionState.questionAttempts.length > 0) {
        await db.questionAttempts.bulkPut(mergedQuestionState.questionAttempts);
      }

      if (backup.lessons && backup.lessons.length > 0) {
        const existingLessons = new Map((await db.lessons.toArray()).map((l) => [l.id, l]));
        const mergedLessons: Lesson[] = [];
        for (const incoming of backup.lessons) {
          const existing = existingLessons.get(incoming.id);
          if (!existing) {
            mergedLessons.push(incoming);
          } else {
            mergedLessons.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.lessons.bulkPut(mergedLessons);
      }

      if (notes.length > 0) {
        const existingNotes = new Map((await db.notes.toArray()).map((n) => [n.id, n]));
        const mergedNotes: Note[] = [];
        for (const incoming of notes) {
          const existing = existingNotes.get(incoming.id);
          if (!existing) {
            mergedNotes.push(incoming);
          } else {
            mergedNotes.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.notes.bulkPut(mergedNotes);
      }

      if (backup.lessonCards && backup.lessonCards.length > 0) {
        const existingLessonCards = new Map(
          (await db.lessonCards.toArray()).map((lc) => [lc.id, lc]),
        );
        const mergedLessonCards: LessonCardLink[] = [];
        for (const incoming of backup.lessonCards) {
          const existing = existingLessonCards.get(incoming.id);
          if (!existing) {
            mergedLessonCards.push(incoming);
          } else {
            mergedLessonCards.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.lessonCards.bulkPut(mergedLessonCards);
      }

      if (backup.lessonCardExposures && backup.lessonCardExposures.length > 0) {
        const existingExposures = new Map(
          (await db.lessonCardExposures.toArray()).map((exposure) => [
            `${exposure.lessonId}\0${exposure.cardId}`,
            exposure,
          ]),
        );
        const mergedExposures: LessonCardExposure[] = backup.lessonCardExposures.map((incoming) => {
          const existing = existingExposures.get(`${incoming.lessonId}\0${incoming.cardId}`);
          if (!existing) return incoming;
          return incoming.taughtAt < existing.taughtAt ? incoming : existing;
        });
        await db.lessonCardExposures.bulkPut(mergedExposures);
      }

      if (backup.lessonCompletions && backup.lessonCompletions.length > 0) {
        const existingCompletions = new Map(
          (await db.lessonCompletions.toArray()).map((completion) => [
            completion.lessonId,
            completion,
          ]),
        );
        const mergedCompletions: LessonCompletion[] = backup.lessonCompletions.map((incoming) => {
          const existing = existingCompletions.get(incoming.lessonId);
          if (!existing) return incoming;
          return incoming.completedAt < existing.completedAt ? incoming : existing;
        });
        await db.lessonCompletions.bulkPut(mergedCompletions);
      }

      if (backup.practiceNodes && backup.practiceNodes.length > 0) {
        const existingPracticeNodes = new Map(
          (await db.practiceNodes.toArray()).map((p) => [p.id, p]),
        );
        const mergedPracticeNodes: PracticeNode[] = [];
        for (const incoming of backup.practiceNodes) {
          const existing = existingPracticeNodes.get(incoming.id);
          if (!existing) {
            mergedPracticeNodes.push(incoming);
          } else {
            mergedPracticeNodes.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.practiceNodes.bulkPut(mergedPracticeNodes);
      }

      if (backup.practiceMilestones && backup.practiceMilestones.length > 0) {
        const existingMilestones = new Map(
          (await db.practiceMilestones.toArray()).map((milestone) => [
            milestone.nodeKey,
            milestone,
          ]),
        );
        const mergedMilestones: PracticeMilestone[] = backup.practiceMilestones.map((incoming) => {
          const existing = existingMilestones.get(incoming.nodeKey);
          if (!existing) return incoming;
          return incoming.updatedAt > existing.updatedAt ? incoming : existing;
        });
        await db.practiceMilestones.bulkPut(mergedMilestones);
      }

      const assessmentIdRemap = new Map<string, string>();
      if (courseAssessments.length > 0) {
        const localAssessments = await db.courseAssessments.toArray();
        const existingCourseAssessments = new Map(
          localAssessments.map((assessment) => [assessment.id, assessment]),
        );
        const existingFinalsByCourse = new Map(
          localAssessments
            .filter((assessment) => assessment.kind === 'final')
            .map((assessment) => [assessment.courseId, assessment]),
        );
        const mergedCourseAssessments: CourseAssessment[] = [];
        for (const incoming of courseAssessments) {
          const existing =
            incoming.kind === 'final'
              ? existingFinalsByCourse.get(incoming.courseId)
              : existingCourseAssessments.get(incoming.id);
          if (!existing) {
            mergedCourseAssessments.push(incoming);
          } else {
            const newer = incoming.createdAt > existing.createdAt ? incoming : existing;
            if (incoming.kind === 'final') assessmentIdRemap.set(incoming.id, existing.id);
            mergedCourseAssessments.push(
              incoming.kind === 'final' ? { ...newer, id: existing.id } : newer,
            );
          }
        }
        await db.courseAssessments.bulkPut(mergedCourseAssessments);
      }

      if (backup.sequences && backup.sequences.length > 0) {
        const existingSequences = new Map((await db.sequences.toArray()).map((s) => [s.id, s]));
        const mergedSequences: Sequence[] = [];
        for (const incoming of backup.sequences) {
          const existing = existingSequences.get(incoming.id);
          if (!existing) {
            mergedSequences.push(incoming);
          } else {
            mergedSequences.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.sequences.bulkPut(mergedSequences);
      }

      if (backup.occlusions && backup.occlusions.length > 0) {
        const existingOcclusions = new Map((await db.occlusions.toArray()).map((o) => [o.id, o]));
        const mergedOcclusions: Occlusion[] = [];
        for (const incoming of backup.occlusions) {
          const existing = existingOcclusions.get(incoming.id);
          if (!existing) {
            mergedOcclusions.push(incoming);
          } else {
            mergedOcclusions.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.occlusions.bulkPut(mergedOcclusions);
      }

      if (hydratedReviewHistory.length > 0) {
        const existingReviewHistory = await db.reviewHistory.toArray();
        const collisionState: ReviewHistoryCollisionState = {
          usedIds: new Set(),
          eventOwners: new Map(),
          entryIdentities: new Map(),
        };
        resolveReviewHistoryCollisions(existingReviewHistory, collisionState);
        const resolvedIncoming = resolveReviewHistoryCollisions(
          hydratedReviewHistory,
          collisionState,
        );
        const existingIds = new Set(existingReviewHistory.map((entry) => entry.id));
        const missingReviewHistory = resolvedIncoming.filter((entry) => !existingIds.has(entry.id));
        if (missingReviewHistory.length > 0) {
          await db.reviewHistory.bulkAdd(missingReviewHistory);
        }
      }

      if (backup.revisionPlans && backup.revisionPlans.length > 0) {
        const existingPlans = new Map(
          (await db.revisionPlans.toArray()).map((plan) => [plan.assessmentId, plan]),
        );
        const incomingPlans = new Map<string, RevisionPlan>();
        for (const raw of backup.revisionPlans) {
          const assessmentId = assessmentIdRemap.get(raw.assessmentId) ?? raw.assessmentId;
          const incoming = { ...raw, assessmentId };
          const duplicate = incomingPlans.get(assessmentId);
          if (!duplicate || incoming.updatedAt > duplicate.updatedAt) {
            incomingPlans.set(assessmentId, incoming);
          }
        }
        const mergedPlans: RevisionPlan[] = [...incomingPlans.values()].map((incoming) => {
          const existing = existingPlans.get(incoming.assessmentId);
          return existing ? mergeRevisionPlans(existing, incoming) : incoming;
        });
        await db.revisionPlans.bulkPut(mergedPlans);
      }

      // Merge target projections by the source unit's interaction timestamp. A stale
      // backup must never regress scheduling controls or pacing statistics that were
      // changed locally after the backup was created.
      const existingSchedulingUnits = new Map(
        (await db.schedulingUnits.toArray()).map((unit) => [unit.id, unit]),
      );
      const mergedSchedulingUnits: SchedulingUnitRecord[] = storageProjection.schedulingUnits.map(
        (incoming) => {
          const existing = existingSchedulingUnits.get(incoming.id);
          if (!existing) return incoming;
          const incomingAt = incoming.lastInteractedAt ?? incoming.createdAt ?? 0;
          const existingAt = existing.lastInteractedAt ?? existing.createdAt ?? 0;
          return incomingAt > existingAt ? incoming : existing;
        },
      );
      const mergedUnitsById = new Map(mergedSchedulingUnits.map((unit) => [unit.id, unit]));
      const existingCoursePerformance = new Map(
        (await db.coursePerformance.toArray()).map((row) => [row.courseId, row]),
      );
      const mergedCoursePerformance: CoursePerformance[] = storageProjection.coursePerformance.map(
        (incoming) => {
          const existing = existingCoursePerformance.get(incoming.courseId);
          if (!existing) return incoming;
          const incomingUnit = mergedUnitsById.get(incoming.courseId);
          const existingUnit = existingSchedulingUnits.get(incoming.courseId);
          const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
          const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
          return incomingAt > existingAt ? incoming : existing;
        },
      );
      const existingSchedulingPerformance = new Map(
        (await db.schedulingPerformance.toArray()).map((row) => [row.schedulingUnitId, row]),
      );
      const mergedSchedulingPerformance: SchedulingPerformance[] =
        storageProjection.schedulingPerformance.map((incoming) => {
          const existing = existingSchedulingPerformance.get(incoming.schedulingUnitId);
          if (!existing) return incoming;
          const incomingUnit = mergedUnitsById.get(incoming.schedulingUnitId);
          const existingUnit = existingSchedulingUnits.get(incoming.schedulingUnitId);
          const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
          const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
          return incomingAt > existingAt ? incoming : existing;
        });
      if (mergedSchedulingUnits.length > 0) {
        await db.schedulingUnits.bulkPut(mergedSchedulingUnits);
      }
      if (mergedCoursePerformance.length > 0) {
        await db.coursePerformance.bulkPut(mergedCoursePerformance);
      }
      if (mergedSchedulingPerformance.length > 0) {
        await db.schedulingPerformance.bulkPut(mergedSchedulingPerformance);
      }

      // Merge cards (most recent lastReviewed wins, falling back to createdAt).
      const existingCards = new Map((await db.cards.toArray()).map((c) => [c.id, c]));
      const mergedCards: Card[] = [];
      for (const incoming of cards) {
        const existing = existingCards.get(incoming.id);
        if (!existing) {
          mergedCards.push(incoming);
        } else {
          const a = existing.lastReviewed ?? existing.createdAt;
          const b = incoming.lastReviewed ?? incoming.createdAt;
          // On a tie, prefer the local copy so the user's latest edits are not
          // silently overwritten by an older backup.
          mergedCards.push(b > a ? incoming : existing);
        }
      }
      await db.cards.bulkPut(mergedCards);

      // Merge performance: prefer the profile whose deck has been studied most
      // recently (lastInteractedAt), so a local deck reset (totalCorrectReviews = 0)
      // is not overwritten by a stale backup with high review counts.
      const existingPerf = new Map((await db.userPerformance.toArray()).map((p) => [p.deckId, p]));
      const mergedPerf: UserPerformance[] = [];
      for (const incoming of backup.userPerformance) {
        const existing = existingPerf.get(incoming.deckId);
        if (!existing) {
          mergedPerf.push(incoming);
        } else {
          const course = existingCourses.get(incoming.deckId);
          const localInteracted = course?.lastInteractedAt ?? course?.createdAt ?? 0;
          const remoteCourse = incomingCourses.get(incoming.deckId);
          const remoteInteracted = remoteCourse?.lastInteractedAt ?? remoteCourse?.createdAt ?? 0;
          // Prefer whichever side has the more recent deck interaction.
          mergedPerf.push(remoteInteracted > localInteracted ? incoming : existing);
        }
      }
      await db.userPerformance.bulkPut(mergedPerf);

      // Append session history that we do not already have.
      const existingKeys = new Set(
        (await db.sessionHistory.toArray()).map((s) =>
          s.eventId ? `event:${s.eventId}` : `legacy:${s.timestamp}:${s.deckId}`,
        ),
      );
      const toAdd = sessionHistory.flatMap((entry) => {
        const key = entry.eventId
          ? `event:${entry.eventId}`
          : `legacy:${entry.timestamp}:${entry.deckId}`;
        if (existingKeys.has(key)) return [];
        existingKeys.add(key);
        const rest = { ...entry };
        delete rest.id;
        return [rest as SessionHistoryEntry];
      });
      if (toAdd.length) await db.sessionHistory.bulkAdd(toAdd);

      // Store incoming tombstones. Do not apply them as deletes — that is P4.
      if (backup.tombstones && backup.tombstones.length > 0) {
        const existingTombstones = await db.tombstones.toArray();
        const byKey = new Map(
          existingTombstones.map((row) => [`${row.table}:${row.recordId}`, row]),
        );
        const merged: Tombstone[] = [];
        for (const incoming of backup.tombstones) {
          const key = `${incoming.table}:${incoming.recordId}`;
          const existing = byKey.get(key);
          if (!existing || incoming.deletedAt > existing.deletedAt) {
            byKey.set(key, incoming);
          }
        }
        for (const row of byKey.values()) merged.push(row);
        await db.tombstones.bulkPut(merged);
      }

      if (agentMemories.length > 0) {
        const local = new Map(
          (await db.agentMemories.toArray()).map((memory) => [memory.id, memory]),
        );
        const incomingById = new Map<string, AgentMemory>();
        for (const incoming of agentMemories) {
          const selected = incomingById.get(incoming.id);
          if (selected && selected.courseId !== incoming.courseId) {
            throw new Error('A learner memory cannot move between global and Course scope.');
          }
          if (!selected || memoryWins(incoming, selected)) incomingById.set(incoming.id, incoming);
        }
        const merged: AgentMemory[] = [];
        for (const incoming of incomingById.values()) {
          if (incoming.courseId !== null && !(await db.courses.get(incoming.courseId))) continue;
          const existing = local.get(incoming.id);
          if (existing && existing.courseId !== incoming.courseId) {
            throw new Error('A learner memory cannot move between global and Course scope.');
          }
          if (!existing || memoryWins(incoming, existing)) merged.push(incoming);
        }
        if (merged.length > 0) await db.agentMemories.bulkPut(merged);
      }
    },
  );
}

function memoryWins(candidate: AgentMemory, current: AgentMemory): boolean {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return canonicalMemory(candidate) > canonicalMemory(current);
}

function canonicalMemory(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalMemory).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalMemory(object[key])}`)
    .join(',')}}`;
}

/** Read and parse a user-selected JSON backup file. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!validateBackup(data)) {
    throw new Error('This file is not a valid Lacuna backup.');
  }
  assertCurrentBackup(data);
  return data;
}
