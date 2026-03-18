import { getCardsByDeckRecursive } from '../db/repositories/cards';
import { getCardState } from '../db/repositories/fsrs';
import { getSequenceCardsWithState } from '../db/repositories/sequenceCards';
import { expandCards, type ReviewQueueItem } from './cardExpansion';
import { applyRating, getRetrievability, type CardWithState } from './fsrs';

export interface ExamModeCard {
  cardWithState: ReviewQueueItem;
  /** Current predicted recall probability at exam date (0–1). */
  retrievabilityAtExam: number;
  /** Predicted recall at exam date if reviewed today with Good rating. */
  retrievabilityAfterReview: number;
  /** retrievabilityAfterReview - retrievabilityAtExam */
  marginalImprovement: number;
  /** Always 1.5 minutes. */
  estimatedMinutes: number;
  /** Rank by marginal improvement: 1 = highest. */
  priority: number;
}

export interface ExamModeSession {
  deckId: string;
  examDate: Date;
  /** 0–1, default 0.90 */
  targetRetention: number;
  /** Computed or provided daily time budget in minutes. */
  dailyBudgetMinutes: number;
  /** All cards sorted descending by marginalImprovement. */
  cards: ExamModeCard[];
  /** Cards selected for today's session (within budget). */
  todayQueue: ExamModeCard[];
  /** Fraction of cards with retrievabilityAtExam >= targetRetention (0–1). */
  examReadiness: number;
  /** Whether the current trajectory reaches target by exam date. */
  onTrack: boolean;
  daysRemaining: number;
}

const MINUTES_PER_CARD = 1.5;
const BUDGET_MULTIPLIER = 1.15;
const MIN_BUDGET_MINUTES = 5;
const MAX_BUDGET_MINUTES = 120;
const MIN_MARGINAL_IMPROVEMENT = 0.01;

export async function buildExamModeSession(
  deckId: string,
  examDate: Date,
  options?: {
    targetRetention?: number;
    dailyBudgetMinutes?: number;
  },
): Promise<ExamModeSession> {
  const targetRetention = options?.targetRetention ?? 0.9;

  // 1. Fetch all cards for the deck recursively.
  const deckCards = await getCardsByDeckRecursive(deckId);
  const withState = await Promise.all(
    deckCards.map(async (card) => {
      const state = await getCardState(card.id);
      if (!state) return null;
      return { card, state } satisfies CardWithState;
    }),
  );

  // 2. Expand cloze and image occlusion cards.
  let sequenceRows: Awaited<ReturnType<typeof getSequenceCardsWithState>> = [];
  if (typeof window !== 'undefined') {
    try {
      sequenceRows = await getSequenceCardsWithState(deckId);
    } catch {
      sequenceRows = [];
    }
  }

  const expanded = expandCards(
    withState.filter((item): item is CardWithState => item !== null),
    sequenceRows.map((row) => ({
      card: row.card,
      items: row.items,
      itemStates: row.itemStates,
    })),
  );

  // 3. Compute per-card metrics.
  const today = new Date();
  const cards: ExamModeCard[] = expanded.map((cardWithState) => {
    const retrievabilityAtExam = getRetrievability(
      cardWithState.state,
      examDate,
    );
    const stateAfterReview = applyRating(cardWithState.state, 'good');
    const retrievabilityAfterReview = getRetrievability(
      stateAfterReview,
      examDate,
    );
    return {
      cardWithState,
      retrievabilityAtExam,
      retrievabilityAfterReview,
      marginalImprovement: retrievabilityAfterReview - retrievabilityAtExam,
      estimatedMinutes: MINUTES_PER_CARD,
      priority: 0,
    };
  });

  // 4. Exam readiness: fraction already at or above target retention.
  const examReadiness =
    cards.length === 0
      ? 0
      : cards.filter((c) => c.retrievabilityAtExam >= targetRetention).length /
        cards.length;

  // 5. Days remaining until exam.
  const daysRemaining = Math.max(
    0,
    Math.ceil((examDate.getTime() - today.getTime()) / 86_400_000),
  );

  // 6. Daily budget.
  const belowTarget = cards.filter(
    (c) => c.retrievabilityAtExam < targetRetention,
  );
  const dailyBudgetMinutes =
    options?.dailyBudgetMinutes !== undefined
      ? options.dailyBudgetMinutes
      : (() => {
          const rawBudgetMinutes = Math.ceil(
            (belowTarget.length * MINUTES_PER_CARD) /
              Math.max(1, daysRemaining),
          );
          return Math.min(
            MAX_BUDGET_MINUTES,
            Math.max(
              MIN_BUDGET_MINUTES,
              Math.ceil(rawBudgetMinutes * BUDGET_MULTIPLIER),
            ),
          );
        })();

  // 7. Sort all cards descending by marginal improvement.
  cards.sort((a, b) => b.marginalImprovement - a.marginalImprovement);
  cards.forEach((card, index) => {
    card.priority = index + 1;
  });

  // 8. Build today's queue: cards below target with meaningful improvement,
  //    within the daily budget.
  const todayQueue: ExamModeCard[] = [];
  let minutesUsed = 0;
  for (const card of cards) {
    if (card.retrievabilityAtExam >= targetRetention) continue;
    if (card.marginalImprovement <= MIN_MARGINAL_IMPROVEMENT) continue;
    if (minutesUsed + card.estimatedMinutes > dailyBudgetMinutes) break;
    todayQueue.push(card);
    minutesUsed += card.estimatedMinutes;
  }

  // 9. On-track indicator.
  const onTrack =
    daysRemaining === 0
      ? examReadiness >= targetRetention
      : todayQueue.length < belowTarget.length;

  return {
    deckId,
    examDate,
    targetRetention,
    dailyBudgetMinutes,
    cards,
    todayQueue,
    examReadiness,
    onTrack,
    daysRemaining,
  };
}
