// Import/Export: the entire database serialises to a single JSON file and back.

import { db } from './schema';
import {
  migrateCardRecord,
  migrateDeckRecord,
  type LegacyCard,
  type LegacyDeck,
} from './migrations';
import type {
  BackupFile,
  Card,
  Course,
  CourseExamDate,
  Deck,
  Folder,
  Lesson,
  LessonCardLink,
  Note,
  PracticeNode,
  Sequence,
  SessionHistoryEntry,
  UserPerformance,
  ImageAsset,
} from './types';
import {
  assetsForBackup,
  backupAssetToImageAsset,
  extractMarkdownAssets,
  referencedAssetHashesInCards,
} from './assets';

export const BACKUP_VERSION = 5;

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
    practiceNodes,
    courseExamDates,
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
    db.practiceNodes.toArray(),
    db.courseExamDates.toArray(),
    db.sequences.toArray(),
  ]);
  const assets = await assetsForBackup(referencedAssetHashesInCards(cards));
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
    courses,
    lessons,
    notes,
    lessonCards,
    practiceNodes,
    courseExamDates,
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
export async function importBackup(
  backup: BackupFile,
  mode: ImportMode,
): Promise<void> {
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
        front: await extractMarkdownAssets(migrated.front, async (asset) => {
          extractedAssets.push(asset);
          knownHashes.add(asset.hash.toLowerCase());
        }, knownHashes),
        back: await extractMarkdownAssets(migrated.back, async (asset) => {
          extractedAssets.push(asset);
          knownHashes.add(asset.hash.toLowerCase());
        }, knownHashes),
      };
    }),
  );
  const importedAssets = [
    ...assets.map(backupAssetToImageAsset),
    ...extractedAssets,
  ];      await db.transaction(
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
      db.lessonCards,
      db.practiceNodes,
      db.courseExamDates,
      db.sequences,
    ],
    async () => {
      // Deduplicate by hash so bulkPut never encounters a constraint conflict.
      const dedupedAssets = Array.from(
        new Map(importedAssets.map((a) => [a.hash, a])).values(),
      );
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
          db.lessonCards.clear(),
          db.practiceNodes.clear(),
          db.courseExamDates.clear(),
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
        if (backup.courses && backup.courses.length > 0) {
          await db.courses.bulkAdd(backup.courses);
        }
        if (backup.lessons && backup.lessons.length > 0) {
          await db.lessons.bulkAdd(backup.lessons);
        }
        if (backup.notes && backup.notes.length > 0) {
          await db.notes.bulkAdd(backup.notes);
        }
        if (backup.lessonCards && backup.lessonCards.length > 0) {
          await db.lessonCards.bulkAdd(backup.lessonCards);
        }
        if (backup.practiceNodes && backup.practiceNodes.length > 0) {
          await db.practiceNodes.bulkAdd(backup.practiceNodes);
        }
        if (backup.courseExamDates && backup.courseExamDates.length > 0) {
          await db.courseExamDates.bulkAdd(backup.courseExamDates);
        }
        if (backup.sequences && backup.sequences.length > 0) {
          await db.sequences.bulkAdd(backup.sequences);
        }
        return;
      }

      // Merge decks field-by-field so local name/colour edits are not clobbered
      // by an incoming backup whose examDate happens to be newer.
      const existingDecks = new Map((await db.decks.toArray()).map((d) => [d.id, d]));
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
        const existingFolders = new Map(
          (await db.folders.toArray()).map((f) => [f.id, f]),
        );
        const mergedFolders: Folder[] = [];
        for (const incoming of backup.folders) {
          const existing = existingFolders.get(incoming.id);
          if (!existing) {
            mergedFolders.push(incoming);
          } else {
            // Prefer newer folder (by createdAt) or keep existing on tie.
            mergedFolders.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.folders.bulkPut(mergedFolders);
      }

      // Merge course-architecture tables: add incoming rows that don't exist locally,
      // preferring the newer record (by createdAt) when both sides have the same id.
      if (backup.courses && backup.courses.length > 0) {
        const existingCourses = new Map(
          (await db.courses.toArray()).map((c) => [c.id, c]),
        );
        const mergedCourses: Course[] = [];
        for (const incoming of backup.courses) {
          const existing = existingCourses.get(incoming.id);
          if (!existing) {
            mergedCourses.push(incoming);
          } else {
            mergedCourses.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.courses.bulkPut(mergedCourses);
      }

      if (backup.lessons && backup.lessons.length > 0) {
        const existingLessons = new Map(
          (await db.lessons.toArray()).map((l) => [l.id, l]),
        );
        const mergedLessons: Lesson[] = [];
        for (const incoming of backup.lessons) {
          const existing = existingLessons.get(incoming.id);
          if (!existing) {
            mergedLessons.push(incoming);
          } else {
            mergedLessons.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.lessons.bulkPut(mergedLessons);
      }

      if (backup.notes && backup.notes.length > 0) {
        const existingNotes = new Map(
          (await db.notes.toArray()).map((n) => [n.id, n]),
        );
        const mergedNotes: Note[] = [];
        for (const incoming of backup.notes) {
          const existing = existingNotes.get(incoming.id);
          if (!existing) {
            mergedNotes.push(incoming);
          } else {
            mergedNotes.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
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
            mergedLessonCards.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.lessonCards.bulkPut(mergedLessonCards);
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
            mergedPracticeNodes.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.practiceNodes.bulkPut(mergedPracticeNodes);
      }

      if (backup.courseExamDates && backup.courseExamDates.length > 0) {
        const existingCourseExamDates = new Map(
          (await db.courseExamDates.toArray()).map((ced) => [ced.id, ced]),
        );
        const mergedCourseExamDates: CourseExamDate[] = [];
        for (const incoming of backup.courseExamDates) {
          const existing = existingCourseExamDates.get(incoming.id);
          if (!existing) {
            mergedCourseExamDates.push(incoming);
          } else {
            mergedCourseExamDates.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
          }
        }
        await db.courseExamDates.bulkPut(mergedCourseExamDates);
      }

      if (backup.sequences && backup.sequences.length > 0) {
        const existingSequences = new Map(
          (await db.sequences.toArray()).map((s) => [s.id, s]),
        );
        const mergedSequences: Sequence[] = [];
        for (const incoming of backup.sequences) {
          const existing = existingSequences.get(incoming.id);
          if (!existing) {
            mergedSequences.push(incoming);
          } else {
            mergedSequences.push(
              incoming.createdAt >= existing.createdAt ? incoming : existing,
            );
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
      const existingPerf = new Map(
        (await db.userPerformance.toArray()).map((p) => [p.deckId, p]),
      );
      const mergedPerf: UserPerformance[] = [];
      for (const incoming of backup.userPerformance) {
        const existing = existingPerf.get(incoming.deckId);
        if (!existing) {
          mergedPerf.push(incoming);
        } else {
          const deck = existingDecks.get(incoming.deckId);
          const localInteracted = deck?.lastInteractedAt ?? deck?.createdAt ?? 0;
          const remoteDeck = decks.find((d) => d.id === incoming.deckId);
          const remoteInteracted = remoteDeck?.lastInteractedAt ?? remoteDeck?.createdAt ?? 0;
          // Prefer whichever side has the more recent deck interaction.
          mergedPerf.push(remoteInteracted >= localInteracted ? incoming : existing);
        }
      }
      await db.userPerformance.bulkPut(mergedPerf);

      // Append session history that we do not already have.
      const existingKeys = new Set(
        (await db.sessionHistory.toArray()).map(
          (s) => `${s.timestamp}:${s.deckId}`,
        ),
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
