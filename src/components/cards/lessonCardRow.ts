// Pure descriptions of a card for the card lists: its kind, a one-line plain-text front
// and when it next comes up. No React so they can be tested directly.

import { parseAudioCardFront } from '../../media/audio';
import type { Card, Occlusion } from '../../db/types';

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
      .replace(/[`*_#>~$]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled card'
  );
}

export type CardScheduleTone = 'new' | 'due' | 'scheduled' | 'paused';

/**
 * When a card next comes up, as a short label for the card list. "Due" agrees with the
 * Cards page's Due filter (`due <= now`), so the chip and the filter never disagree.
 */
export function cardScheduleLabel(
  card: Card,
  now: number,
): { label: string; tone: CardScheduleTone } {
  if (card.suspended === true) return { label: 'Suspended', tone: 'paused' };
  if (card.buriedUntil !== null && card.buriedUntil !== undefined && card.buriedUntil > now)
    return { label: 'Buried', tone: 'paused' };
  if (card.lastReviewed === null || card.due === null) return { label: 'New', tone: 'new' };
  if (card.due <= now) return { label: 'Due', tone: 'due' };
  // Calendar days, so a card due at 9am tomorrow reads "Tomorrow" at 11pm tonight.
  const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(card.due) - startOfDay(now)) / 86_400_000);
  return {
    label: days <= 0 ? 'Later today' : days === 1 ? 'Tomorrow' : `In ${days} days`,
    tone: 'scheduled',
  };
}

/** Cards that have been seen and left the New state. */
export function learntCardCount(cards: readonly Card[]): number {
  return cards.filter((card) => card.lastReviewed !== null && card.state !== 0).length;
}

/**
 * Cards in their given order, except that each occlusion's cards are gathered where its
 * first card appears and follow its regions, so "Label 1 of 4" leads its siblings.
 */
export function orderOcclusionSiblings(cards: readonly Card[], occlusions: readonly Occlusion[]): Card[] {
  const owner = new Map<string, { id: string; index: number }>();
  for (const occlusion of occlusions) {
    occlusion.regions.forEach((region, index) => owner.set(region.id, { id: occlusion.id, index }));
  }
  const siblings = new Map<string, Card[]>();
  for (const card of cards) {
    const found = card.occlusionRegionId ? owner.get(card.occlusionRegionId) : undefined;
    if (found) siblings.set(found.id, [...(siblings.get(found.id) ?? []), card]);
  }
  const ordered: Card[] = [];
  const placed = new Set<string>();
  for (const card of cards) {
    const found = card.occlusionRegionId ? owner.get(card.occlusionRegionId) : undefined;
    if (!found) {
      ordered.push(card);
    } else if (!placed.has(found.id)) {
      placed.add(found.id);
      ordered.push(
        ...siblings
          .get(found.id)!
          .sort((a, b) => owner.get(a.occlusionRegionId!)!.index - owner.get(b.occlusionRegionId!)!.index),
      );
    }
  }
  return ordered;
}
