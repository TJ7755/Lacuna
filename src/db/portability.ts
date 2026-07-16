// Import/Export: the entire database serialises to a single JSON file and back.

import { db, makeId } from './schema';
import {
  migrateCardRecord,
  migrateDeckRecord,
  type LegacyCard,
  type LegacyDeck,
} from './migrations';
import type {
  BackupFile,
  Card,
  CourseAssessment,
  CourseRecord,
  Deck,
  Folder,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  PracticeNode,
  PracticeMilestone,
  Sequence,
  SessionHistoryEntry,
  UserPerformance,
  ImageAsset,
} from './types';
import {
  buildCourseAssessmentMigration,
  finalAssessmentForCourse,
  hydrateCourse,
  type LegacyAssessmentRecord,
  type LegacyCourseRecord,
} from './assessmentMigration';
import {
  assetsForBackup,
  backupAssetToImageAsset,
  extractMarkdownAssets,
  referencedAssetHashes,
  referencedAssetHashesInCards,
} from './assets';

export const BACKUP_VERSION = 6;

/** Gather the whole database into a single backup object. */
export async function exportDatabase(): Promise<BackupFile> {
  const [
    decks,
    cards,
    sessionHistory,
    userPerformance,
    folders,
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
  ] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.sessionHistory.toArray(),
    db.userPerformance.toArray(),
    db.folders.toArray(),
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
  ]);
  const referencedHashes = new Set(referencedAssetHashesInCards(cards));
  for (const note of notes) {
    for (const hash of referencedAssetHashes(note.content)) referencedHashes.add(hash);
  }
  const assets = await assetsForBackup([...referencedHashes]);
  const exportedCourses: LegacyCourseRecord[] = courses.map((course) => {
    const hydrated = hydrateCourse(course, finalAssessmentForCourse(course.id, courseAssessments));
    return {
      ...course,
      examDate: hydrated.examDate,
      ...(hydrated.timeZone ? { timeZone: hydrated.timeZone } : {}),
    };
  });
  const exportedCheckpoints: LegacyAssessmentRecord[] = courseAssessments
    .filter((assessment) => assessment.kind === 'checkpoint')
    .map((assessment) => ({
      id: assessment.id,
      courseId: assessment.courseId,
      name: assessment.name,
      examDate: assessment.examDate,
      ...(assessment.timeZone ? { timeZone: assessment.timeZone } : {}),
      ...(assessment.coverageMode === 'custom' ? { lessonIds: [...assessment.lessonIds] } : {}),
      excludedCardIds: [...assessment.excludedCardIds],
      createdAt: assessment.createdAt,
    }));
  return {
    app: 'lacuna',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    decks,
    cards,
    assets,
    sessionHistory,
    userPerformance,
    folders,
    courses: exportedCourses,
    lessons,
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseExamDates: exportedCheckpoints,
    sequences,
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
  return (
    b.app === 'lacuna' &&
    typeof b.version === 'number' &&
    Array.isArray(b.decks) &&
    Array.isArray(b.cards) &&
    Array.isArray(b.assets) &&
    Array.isArray(b.sessionHistory) &&
    Array.isArray(b.userPerformance)
  );
}

export type ImportMode = 'replace' | 'merge';

/**
 * Import a backup. In "replace" mode the database is cleared first; in "merge" mode
 * records are matched by id and the most recently touched copy wins each conflict.
 * SessionHistory is append-only and de-duplicated by (timestamp, deckId).
 */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  if (!validateBackup(backup)) {
    throw new Error('Invalid backup file.');
  }

  // Pre-process markdown assets outside the IndexedDB transaction so long-running
  // canvas compressions cannot auto-abort the import transaction.
  const decks = backup.decks.map((d) => migrateDeckRecord(d as LegacyDeck));
  const assets = backup.assets;
  const knownHashes = new Set(backup.assets.map((a) => a.hash.toLowerCase()));
  const extractedAssets: ImageAsset[] = [];
  const cards = await Promise.all(
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
  const importedAssets = [...assets.map(backupAssetToImageAsset), ...extractedAssets];
  const assessmentMigration = buildCourseAssessmentMigration(
    backup.courses ?? [],
    backup.lessons ?? [],
    backup.courseExamDates ?? [],
    makeId,
  );
  const courses = assessmentMigration.courses;
  const courseAssessments = assessmentMigration.assessments;
  await db.transaction(
    'rw',
    [
      db.decks,
      db.cards,
      db.sessionHistory,
      db.userPerformance,
      db.assets,
      db.folders,
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
    ],
    async () => {
      // Deduplicate by hash so bulkPut never encounters a constraint conflict.
      const dedupedAssets = Array.from(new Map(importedAssets.map((a) => [a.hash, a])).values());
      if (mode === 'replace') {
        await Promise.all([
          db.decks.clear(),
          db.cards.clear(),
          db.sessionHistory.clear(),
          db.userPerformance.clear(),
          db.assets.clear(),
          db.folders.clear(),
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
        ]);
        await db.decks.bulkAdd(decks);
        await db.cards.bulkAdd(cards);
        if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);
        await db.userPerformance.bulkAdd(backup.userPerformance);
        // Drop incoming auto-increment ids so they are reassigned cleanly.
        await db.sessionHistory.bulkAdd(
          backup.sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
        );
        // Restore folders if present in the backup.
        if (backup.folders && backup.folders.length > 0) {
          await db.folders.bulkAdd(backup.folders);
        }
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
        return;
      }

      // Merge decks field-by-field so local name/colour edits are not clobbered
      // by an incoming backup whose examDate happens to be newer.
      const existingDecks = new Map((await db.decks.toArray()).map((d) => [d.id, d]));
      const existingCourses = new Map((await db.courses.toArray()).map((c) => [c.id, c]));
      const incomingCourses = new Map(courses.map((c) => [c.id, c]));
      const mergedDecks: Deck[] = [];
      for (const incoming of decks) {
        const existing = existingDecks.get(incoming.id);
        if (!existing) {
          mergedDecks.push(incoming);
        } else {
          const a = existing.lastInteractedAt ?? existing.createdAt;
          const b = incoming.lastInteractedAt ?? incoming.createdAt;
          const newer = b >= a ? incoming : existing;
          const older = b >= a ? existing : incoming;
          // Preserve local edits to name/colour while adopting newer scheduling state.
          mergedDecks.push({
            ...older,
            ...newer,
            name: newer.name || older.name,
            colour: newer.colour ?? older.colour,
          });
        }
      }
      await db.decks.bulkPut(mergedDecks);
      if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);

      // Merge folders: add incoming folders that don't exist locally.
      if (backup.folders && backup.folders.length > 0) {
        const existingFolders = new Map((await db.folders.toArray()).map((f) => [f.id, f]));
        const mergedFolders: Folder[] = [];
        for (const incoming of backup.folders) {
          const existing = existingFolders.get(incoming.id);
          if (!existing) {
            mergedFolders.push(incoming);
          } else {
            // Prefer newer folder (by createdAt) or keep existing on tie.
            mergedFolders.push(incoming.createdAt > existing.createdAt ? incoming : existing);
          }
        }
        await db.folders.bulkPut(mergedFolders);
      }

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
          const deck = existingDecks.get(incoming.deckId);
          const course = existingCourses.get(incoming.deckId);
          const localInteracted =
            deck?.lastInteractedAt ??
            course?.lastInteractedAt ??
            deck?.createdAt ??
            course?.createdAt ??
            0;
          const remoteDeck = decks.find((d) => d.id === incoming.deckId);
          const remoteCourse = incomingCourses.get(incoming.deckId);
          const remoteInteracted =
            remoteDeck?.lastInteractedAt ??
            remoteCourse?.lastInteractedAt ??
            remoteDeck?.createdAt ??
            remoteCourse?.createdAt ??
            0;
          // Prefer whichever side has the more recent deck interaction.
          mergedPerf.push(remoteInteracted > localInteracted ? incoming : existing);
        }
      }
      await db.userPerformance.bulkPut(mergedPerf);

      // Append session history that we do not already have.
      const existingKeys = new Set(
        (await db.sessionHistory.toArray()).map((s) => `${s.timestamp}:${s.deckId}`),
      );
      const toAdd = backup.sessionHistory
        .filter((s) => !existingKeys.has(`${s.timestamp}:${s.deckId}`))
        .map(({ id: _id, ...rest }) => rest as SessionHistoryEntry);
      if (toAdd.length) await db.sessionHistory.bulkAdd(toAdd);
    },
  );
}

/** Read and parse a user-selected JSON backup file. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!validateBackup(data)) {
    throw new Error('This file is not a valid Lacuna backup.');
  }
  return data;
}
