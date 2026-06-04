// Leech detection. A "leech" is a card that has been failed so many times it is
// quietly eating study time and probably needs rewording or splitting. We surface
// them (a badge plus a search filter) but never change scheduling automatically —
// the user decides what to do. The threshold is a fixed total-lapse count.

import type { Card } from '../db/types';

/** Total lapses at or above which a card is treated as a leech. */
export const LEECH_LAPSE_THRESHOLD = 8;

/** Whether a card has lapsed often enough to be flagged as a leech. */
export function isLeech(card: Card): boolean {
  return card.lapses >= LEECH_LAPSE_THRESHOLD;
}
