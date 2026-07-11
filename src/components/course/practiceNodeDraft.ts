// Shared draft shape and helpers for authoring a manual PracticeNode, used by both
// PracticeNodeEditor (the modal opened from the course path) and PracticeNodesSection
// (the course-settings management list). Keeping the draft/parsing logic in one place
// avoids the two surfaces drifting out of sync.
//
// British English throughout.

import type { PracticeNode } from '../../db/types';

export interface PracticeNodeDraft {
  name: string;
  /** Undefined = start of course; otherwise the orderIndex of the lesson it follows. */
  position?: number;
  lessonIds?: string[];
  /** Kept as a string for input binding; parsed to a number with parseCardCount on save. */
  cardCount: string;
  randomize: boolean;
}

export function emptyPracticeNodeDraft(defaultPosition?: number): PracticeNodeDraft {
  return { name: '', position: defaultPosition, lessonIds: undefined, cardCount: '', randomize: false };
}

export function draftFromPracticeNode(node: PracticeNode): PracticeNodeDraft {
  return {
    name: node.name,
    position: node.position,
    lessonIds: node.lessonIds,
    cardCount: node.cardCount ? String(node.cardCount) : '',
    randomize: node.randomize ?? false,
  };
}

/** Parses the draft's cardCount string into the optional positive-integer field the repository expects. */
export function parseCardCount(value: string): number | undefined {
  const parsed = Math.floor(Number(value));
  return value.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? undefined : parsed;
}
