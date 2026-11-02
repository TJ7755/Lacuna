import type { MarkAllocation } from '@lacuna/core/questions/questionSets';
import {
  activeTechniqueIds,
  suggestedTechniqueIds,
  techniqueName,
  type CourseTechnique,
} from '@lacuna/core/questions/techniqueTags';

export interface TechniqueSummary {
  /** Names whose marks feed technique memory. */
  active: string[];
  /** Jev's unsure classifications, which do not count until confirmed. */
  unsure: string[];
  /** Points with a suggestion from Jev still waiting for the author. */
  pending: number;
  /** Tagged points that will not schedule because they test Knowledge. */
  knowledgeTagged: number;
}

/** One question's technique state, condensed for its row. */
export function summariseTechniques(
  allocations: readonly MarkAllocation[],
  catalogue: readonly CourseTechnique[],
): TechniqueSummary {
  const active = new Set<string>();
  const unsure = new Set<string>();
  let knowledgeTagged = 0;
  let pending = 0;
  for (const point of allocations) {
    const ids = activeTechniqueIds(point.techniqueTags);
    const suggested = suggestedTechniqueIds(point.techniqueTags);
    if (ids.length && point.dimension === 'knowledge') knowledgeTagged += 1;
    if (suggested.length) pending += 1;
    for (const id of ids) active.add(id);
    for (const id of suggested) unsure.add(id);
  }
  return {
    active: [...active].map((id) => techniqueName(catalogue, id)),
    unsure: [...unsure].filter((id) => !active.has(id)).map((id) => techniqueName(catalogue, id)),
    pending,
    knowledgeTagged,
  };
}

export function summaryText(summary: TechniqueSummary): string {
  const parts = [...summary.active, ...summary.unsure.map((name) => `${name} (unsure)`)];
  const notes = [parts.length ? parts.join(', ') : 'none'];
  if (summary.pending)
    notes.push(
      `${summary.pending === 1 ? 'One point has' : `${summary.pending} points have`} unsure suggestions to confirm`,
    );
  if (summary.knowledgeTagged)
    notes.push(
      `${summary.knowledgeTagged === 1 ? 'One point tests' : `${summary.knowledgeTagged} points test`} Knowledge, so its techniques do not count`,
    );
  return notes.join('. ');
}
