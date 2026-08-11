import type { ApkgImportResult } from '../../db/apkgImport';
import type { ParsedCard } from '../../db/import';
import { importApkgResult } from '../../db/apkgImport';
import { createCards, restoreCards, type CardSnapshot } from '../../db/repository';
import type { SchedulerConfig } from '../../db/types';

/** A destination available to an explicitly legacy card-move action. */
export interface CardMoveTarget {
  id: string;
  name: string;
}

/**
 * The domain-neutral capabilities CardList needs from its surrounding surface.
 * Course/Lesson callers can provide this without exposing a hidden backing Deck;
 * legacy callers may continue using the Deck compatibility props for now.
 */
export interface CardListContext {
  schedulingConfig: SchedulerConfig;
  importTargetName: string;
  /** Optional backing-deck id used only for duplicate detection in the import panel. */
  importTargetId?: string;
  onImport: (cards: ParsedCard[]) => void | Promise<void>;
  onApkgImport: (result: ApkgImportResult) => void | Promise<void>;
  /** Omit moveTargets and onMove when moving cards is not meaningful for this surface. */
  moveTargets?: CardMoveTarget[];
  onMove?: (cardIds: string[], targetId: string) => void | Promise<void>;
  onRestore: (snapshot: CardSnapshot) => void | Promise<void>;
}

/** Build the shared adapter used by Course and Lesson card-management surfaces. */
export function courseCardListContext({
  schedulingConfig,
  courseId,
  primaryLessonId,
  importTargetName,
}: {
  schedulingConfig: SchedulerConfig;
  courseId: string;
  primaryLessonId: string | null;
  importTargetName: string;
}): CardListContext {
  return {
    schedulingConfig,
    importTargetId: schedulingConfig.id,
    importTargetName,
    onImport: async (cards) => {
      await createCards(schedulingConfig.id, cards, { courseId, primaryLessonId });
    },
    onApkgImport: async (result) => {
      await importApkgResult(result, schedulingConfig.id, { courseId, primaryLessonId });
    },
    onRestore: restoreCards,
  };
}
