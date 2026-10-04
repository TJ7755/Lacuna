// Pure summary of a card for the compact "Cards in this lesson" list: a status tone,
// a one-line plain-text front, and a "type · state" caption. No React so it can be
// tested directly.

import { parseAudioCardFront } from '../../media/audio';
import type { Card } from '../../db/types';

export type CardStatusTone = 'new' | 'learning' | 'review' | 'lapsed' | 'paused';

export interface LessonCardRowSummary {
  tone: CardStatusTone;
  front: string;
  caption: string;
}

const STATE_LABELS = ['New', 'Learning', 'Review', 'Relearning'] as const;

/** Human label for a card's kind, covering generated and structured cards. */
export function cardKindLabel(card: Card): string {
  if (card.sequenceItemId !== undefined && card.sequenceItemId !== null) return 'Sequence';
  if (card.occlusionRegionId !== undefined && card.occlusionRegionId !== null) return 'Occlusion';
  if (card.payload?.kind === 'numeric') return 'Numeric';
  if (card.payload?.kind === 'working') return 'Working';
  if (parseAudioCardFront(card.front) !== null) return 'Audio';
  if (card.type === 'cloze') return 'Cloze';
  if (card.type === 'basic_reversed') return 'Reversed';
  return 'Front / back';
}

/** Markdown and cloze notation reduced to the words a reader would see. */
export function plainFront(card: Card): string {
  const audio = parseAudioCardFront(card.front);
  const source = audio ? audio.prompt || 'Audio card' : card.front;
  return (
    source
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/gs, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_#>~]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled card'
  );
}

export function summariseLessonCard(card: Card, now: number): LessonCardRowSummary {
  const paused =
    card.suspended === true ||
    (card.buriedUntil !== null && card.buriedUntil !== undefined && card.buriedUntil > now);
  const tone: CardStatusTone = paused
    ? 'paused'
    : card.lastReviewed === null || card.state === 0
      ? 'new'
      : card.state === 3
        ? 'lapsed'
        : card.state === 2
          ? 'review'
          : 'learning';
  const stateLabel = paused ? 'Paused' : STATE_LABELS[card.state] ?? 'New';
  return {
    tone,
    front: plainFront(card),
    caption: `${cardKindLabel(card)} · ${stateLabel}`,
  };
}

/** Cards that have been seen and left the New state. */
export function learntCardCount(cards: readonly Card[]): number {
  return cards.filter((card) => card.lastReviewed !== null && card.state !== 0).length;
}
