// Resolves which cards in a Learn mode session pool were generated from a lines-mode
// Sequence (see sequenceGeneration.ts's "Lines mode" section), so LearnMode can offer the
// first-letter hint step only for cards that came from a script rather than a plain list.
//
// Learn mode reads a static snapshot of its card pool once per session (see the loading
// effect in LearnMode.tsx), so this batches one `listSequences` per distinct courseId
// among the pool's generated cards rather than querying per-card.

import { listSequences } from './repository';
import { sequenceForItemId } from './sequenceGeneration';
import type { Card, Sequence } from './types';

/**
 * Map each card generated from a `lines`-mode sequence to its owning Sequence. Cards not
 * generated from a sequence, or generated from a `list`-mode sequence, are omitted.
 */
export async function linesModeSequencesByCard(cards: Card[]): Promise<Map<string, Sequence>> {
  const generated = cards.filter(
    (card): card is Card & { sequenceItemId: string; courseId: string } =>
      card.sequenceItemId !== undefined && !!card.courseId,
  );
  if (generated.length === 0) return new Map();

  const courseIds = [...new Set(generated.map((card) => card.courseId))];
  const sequencesByCourse = await Promise.all(courseIds.map((id) => listSequences(id)));
  const allSequences = sequencesByCourse.flat();

  const result = new Map<string, Sequence>();
  for (const card of generated) {
    const sequence = sequenceForItemId(allSequences, card.sequenceItemId);
    if (sequence?.mode === 'lines') result.set(card.id, sequence);
  }
  return result;
}
