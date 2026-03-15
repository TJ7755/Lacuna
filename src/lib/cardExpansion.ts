import type { CardWithState } from './fsrs';
import { getClozeIndices } from './cloze';

// Expand a flat list of CardWithState into individual reviewable items
// Basic cards: one item
// Cloze cards: one item per cloze index (with activeIndex set)
// Image occlusion cards: one item per occlusion rect (with activeRectId set)
export function expandCards(cards: CardWithState[]): CardWithState[] {
  const result: CardWithState[] = [];

  for (const cws of cards) {
    if (cws.card.card_type === 'cloze' && cws.card.cloze_text) {
      const indices = getClozeIndices(cws.card.cloze_text);
      if (indices.length > 1) {
        for (const idx of indices) {
          result.push({ ...cws, activeIndex: idx });
        }
        continue;
      }
      result.push({ ...cws, activeIndex: indices[0] ?? 1 });
      continue;
    }

    if (cws.card.card_type === 'image_occlusion' && cws.card.occlusion_data) {
      const data = cws.card.occlusion_data as unknown;
      if (Array.isArray(data) && data.length > 0) {
        for (const rect of data as Array<{ id: string }>) {
          result.push({ ...cws, activeRectId: rect.id });
        }
        continue;
      }
    }

    result.push(cws);
  }

  return result;
}
