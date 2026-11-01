import { importCardsToDestination } from '../../db/cardImport';
import type { ApkgImportResult } from '../../db/apkgImport';
import type { ParsedCard } from '../../db/import';
import { restoreCards, type CardSnapshot } from '../../db/cardRepository';
import type { SchedulerConfig } from '@lacuna/core/db/types';

/** A destination available to an explicitly legacy card-move action. */
export interface CardMoveTarget {
  id: string;
  name: string;
}

/**
 * The domain-neutral capabilities CardList needs from its surrounding surface.
 * Course/Lesson callers provide this without exposing a hidden backing Deck.
 */
export interface CardListContext {
  schedulingConfig: SchedulerConfig;
  importTargetName: string;
  /** Optional backing-deck id used only for duplicate detection in the import panel. */
  importTargetId?: string;
  onImport: (cards: ParsedCard[], reverse?: boolean) => void | Promise<void>;
  onApkgImport: (result: ApkgImportResult) => void | Promise<void>;
  /** Omit moveTargets and onMove when moving cards is not meaningful for this surface. */
  moveTargets?: CardMoveTarget[];
  onMove?: (cardIds: string[], targetId: string) => void | Promise<void>;
  onRestore: (snapshot: CardSnapshot) => void | Promise<void>;
}

/** Build the shared adapter used by Course and Lesson card-management surfaces. */
export function courseCardListContext({
  schedulingConfig,
  importTargetName,
}: {
  schedulingConfig: SchedulerConfig;
  courseId: string;
  primaryLessonId: string | null;
  importTargetName: string;
}): CardListContext {
  const destination = { kind: 'existing' as const, schedulingUnitId: schedulingConfig.id };
  return {
    schedulingConfig,
    importTargetId: schedulingConfig.id,
    importTargetName,
    onImport: async (cards, reverse = false) => {
      await importCardsToDestination(destination, { kind: 'text', cards, reverse });
    },
    onApkgImport: async (result) => {
      await importCardsToDestination(destination, { kind: 'apkg', result });
    },
    onRestore: restoreCards,
  };
}
