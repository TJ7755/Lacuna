// Read represented records and their media together; encoding runs after the snapshot closes.
import { db } from './schema';
import type { BackupFile } from './types';
import { projectCardsForStorage } from './reviewHistory';
import {
  encodeBackupAssets,
  referencedAssetHashes,
  referencedAssetHashesInCards,
  referencedAssetHashesInValues,
} from './assets';

export const BACKUP_VERSION = 15;

/** Gather the whole database into a single, consistent backup object. */
export async function exportDatabase(): Promise<BackupFile> {
  const { mediaAssets, ...snapshot } = await db.transaction(
    'r',
    [
      db.cards,
      db.sessionHistory,
      db.courses,
      db.lessons,
      db.notes,
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
      db.questionSets,
      db.questionSetAttempts,
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
      db.assets,
    ],
    async () => {
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
        questionSets,
        questionSetAttempts,
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
        db.questionSets.toArray(),
        db.questionSetAttempts.toArray(),
        db.lineageIdMappings.toArray(),
        db.pendingMergeReviews.toArray(),
        db.agentMemories.toArray(),
      ]);
      const projectedCards = projectCardsForStorage(cards);
      const referencedHashes = new Set(referencedAssetHashesInCards(projectedCards));
      for (const note of notes) {
        for (const hash of referencedAssetHashes(note.content)) referencedHashes.add(hash);
      }
      // An occlusion's diagram is referenced solely by `Occlusion.assetHash` — its generated
      // cards carry a plain-text fallback, not a Markdown embed — so it must be gathered
      // explicitly or a backup would restore occlusions with no image (mirrors assets.ts's GC).
      for (const occlusion of occlusions) referencedHashes.add(occlusion.assetHash);
      referencedAssetHashesInValues(
        questions,
        questionAttempts,
        questionSets,
        questionSetAttempts,
      ).forEach((hash) => referencedHashes.add(hash));
      const mediaAssets = referencedHashes.size
        ? await db.assets
            .where('hash')
            .anyOf([...referencedHashes])
            .toArray()
        : [];
      return {
        app: 'lacuna-v15' as const,
        version: BACKUP_VERSION,
        exportedAt: Date.now(),
        cards: projectedCards,
        mediaAssets,
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
        reviewHistory,
        schedulingUnits,
        coursePerformance,
        schedulingPerformance,
        tombstones,
        concepts,
        questions,
        questionConcepts,
        questionAttempts,
        questionSets,
        questionSetAttempts,
        lineageIdMappings,
        pendingMergeReviews,
        agentMemories,
      };
    },
  );
  // Reading a legacy Blob can outlive IndexedDB's transaction. Only encode the
  // captured rows here, so asynchronous byte conversion cannot split the snapshot.
  return { ...snapshot, assets: await encodeBackupAssets(mediaAssets) };
}
