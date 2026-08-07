// Resolves occlusion data for cards in a Learn mode session pool, so the study renderer
// (src/components/occlusion/OcclusionStudyFace.tsx) can render a diagram without a
// per-card query, and so Learn mode can decide typed-mode eligibility per card (§6.5:
// typed mode is offered only where the target region resolves an answerText). Mirrors
// linesModeCards.ts's batching approach: one listOcclusions per distinct courseId among
// the pool's occlusion-generated cards, rather than a query per card.

import { listOcclusions } from './occlusionRepository';
import { occlusionForRegionId, resolveOcclusionAnswerText } from './occlusionGeneration';
import type { Card, Occlusion } from './types';

/** What a Learn mode session needs for one occlusion-generated card: its owning
 *  Occlusion (for rendering) and the resolved typed-mode answer text, if any. */
export interface OcclusionCardData {
  occlusion: Occlusion;
  /** Undefined when the target region has no answerText — typed mode is not offered. */
  answerText: string | undefined;
}

/** Map each occlusion-generated card in `cards` to its owning Occlusion and resolved
 *  typed-mode answer text. Cards not generated from an occlusion, or whose region no
 *  longer resolves to an occlusion, are omitted. */
export async function occlusionDataByCard(cards: Card[]): Promise<Map<string, OcclusionCardData>> {
  const generated = cards.filter(
    (card): card is Card & { occlusionRegionId: string; courseId: string } =>
      card.occlusionRegionId !== undefined && !!card.courseId,
  );
  if (generated.length === 0) return new Map();

  const courseIds = [...new Set(generated.map((card) => card.courseId))];
  const occlusionsByCourse = await Promise.all(courseIds.map((id) => listOcclusions(id)));
  const allOcclusions = occlusionsByCourse.flat();

  const result = new Map<string, OcclusionCardData>();
  for (const card of generated) {
    const occlusion = occlusionForRegionId(allOcclusions, card.occlusionRegionId);
    if (!occlusion) continue;
    result.set(card.id, {
      occlusion,
      answerText: resolveOcclusionAnswerText(occlusion, card.occlusionRegionId),
    });
  }
  return result;
}
