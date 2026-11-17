import type { SchedulerConfig } from '@lacuna/core/db/types';

/**
 * A heading for the deck/summary panels. Names what `progressValue` computes for
 * the deck's objective: mean predicted recall, or the share of Cards at 90%.
 */
export function progressHeading(deck: SchedulerConfig): string {
  return deck.examObjective === 'securedTopics'
    ? 'Cards at 90% predicted recall'
    : 'Predicted recall';
}
