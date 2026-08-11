import type { SchedulerConfig } from '../../db/types';
import type { ApkgImportResult } from '../../db/apkgImport';
import type { ParsedCard } from '../../db/import';
import type { CardSnapshot } from '../../db/repository';

/** A destination available to the explicitly legacy card-move action. */
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
  /** Omit moveTargets when moving cards is not meaningful for this surface. */
  moveTargets?: CardMoveTarget[];
  onMove: (cardIds: string[], targetId: string) => void | Promise<void>;
  onRestore: (snapshot: CardSnapshot) => void | Promise<void>;
}
