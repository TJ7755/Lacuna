import type { Card } from '../db/types';

/** Whether the configured typing presentation can answer this ordinary card. */
export function isTypingEligible(card: Pick<Card, 'type' | 'payload'>): boolean {
  return (
    card.payload === undefined &&
    (card.type === 'front_back' || card.type === 'basic_reversed' || card.type === 'cloze')
  );
}
