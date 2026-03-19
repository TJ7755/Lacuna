import { getClozeIndices } from './cloze';
import type { CardWithState } from './fsrs';
import type { SequenceCard, SequenceItem } from '../types';
import type { FsrsState } from '../db/repositories/fsrs';

export type ReviewQueueItem =
  | (CardWithState & {
      queueType: 'card';
      cardType: 'basic' | 'cloze' | 'image_occlusion';
      fsrsStateId: string;
      fsrsCardId: string;
    })
  | {
      queueType: 'sequence_chain';
      cardType: 'sequence_chain';
      cardId: string;
      itemId: string;
      position: number;
      totalItems: number;
      sequenceTitle: string;
      prompt: string;
      answer: string;
      state: FsrsState;
      fsrsStateId: string;
      fsrsCardId: string;
    };

// Expand a flat list of CardWithState into individual reviewable items
// Basic cards: one item
// Cloze cards: one item per cloze index (with activeIndex set)
// Image occlusion cards: one item per occlusion rect (with activeRectId set)
// Sequence cards: one chain item per due sequence item
export function expandCards(
  cards: CardWithState[],
  sequenceData?: Array<{
    card: SequenceCard;
    items: SequenceItem[];
    itemStates: FsrsState[];
  }>,
): ReviewQueueItem[] {
  const result: ReviewQueueItem[] = [];

  for (const cws of cards) {
    if (cws.card.card_type === 'cloze' && cws.card.cloze_text) {
      const indices = getClozeIndices(cws.card.cloze_text);
      if (indices.length > 1) {
        for (const idx of indices) {
          result.push({
            ...cws,
            activeIndex: idx,
            queueType: 'card',
            cardType: 'cloze',
            fsrsStateId: cws.state.id,
            fsrsCardId: cws.card.id,
          });
        }
        continue;
      }
      result.push({
        ...cws,
        activeIndex: indices[0] ?? 1,
        queueType: 'card',
        cardType: 'cloze',
        fsrsStateId: cws.state.id,
        fsrsCardId: cws.card.id,
      });
      continue;
    }

    if (cws.card.card_type === 'image_occlusion' && cws.card.occlusion_data) {
      const data = cws.card.occlusion_data as unknown;
      if (Array.isArray(data) && data.length > 0) {
        for (const rect of data as Array<{ id: string }>) {
          result.push({
            ...cws,
            activeRectId: rect.id,
            queueType: 'card',
            cardType: 'image_occlusion',
            fsrsStateId: cws.state.id,
            fsrsCardId: cws.card.id,
          });
        }
        continue;
      }
    }

    result.push({
      ...cws,
      queueType: 'card',
      cardType: cws.card.card_type,
      fsrsStateId: cws.state.id,
      fsrsCardId: cws.card.id,
    });
  }

  if (sequenceData) {
    const now = new Date();
    for (const sequence of sequenceData) {
      const itemStateById = new Map(
        sequence.itemStates.map((state) => [state.card_id, state]),
      );
      const sortedItems = [...sequence.items].sort(
        (a, b) => a.position - b.position,
      );

      for (let index = 0; index < sortedItems.length; index += 1) {
        const item = sortedItems[index];
        const state = itemStateById.get(item.id);
        if (!state || state.due > now) continue;

        const previous = index > 0 ? sortedItems[index - 1] : null;
        result.push({
          queueType: 'sequence_chain',
          cardType: 'sequence_chain',
          cardId: sequence.card.id,
          itemId: item.id,
          position: item.position,
          totalItems: sortedItems.length,
          sequenceTitle: sequence.card.title,
          prompt: previous ? previous.content : sequence.card.title,
          answer: item.content,
          state,
          fsrsStateId: state.id,
          fsrsCardId: item.id,
        });
      }
    }
  }

  return result;
}
