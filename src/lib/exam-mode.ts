import { getCardsByDeckRecursive } from '../db/repositories/cards';
import { getCardState } from '../db/repositories/fsrs';
import { expandCards } from './cardExpansion';
import { getRetrievability, type CardWithState } from './fsrs';

export interface ExamModeCard {
  cardWithState: CardWithState;
  retrievabilityAtExam: number;
  priority: number;
}

export interface ExamModeSession {
  deckId: string;
  examDate: Date;
  cards: ExamModeCard[];
  estimatedReviewable: number;
}

// Build an exam mode session for a deck
// Returns cards sorted by ascending retrievability at examDate
// Cards with no FSRS state (never reviewed) come first with retrievability = 0
export async function buildExamModeSession(
  deckId: string,
  examDate: Date,
  dailyReviewCapacity = 50,
): Promise<ExamModeSession> {
  const deckCards = await getCardsByDeckRecursive(deckId);
  const withState = await Promise.all(
    deckCards.map(async (card) => {
      const state = await getCardState(card.id);
      if (!state) {
        return null;
      }
      return {
        card,
        state,
      } satisfies CardWithState;
    }),
  );

  const expanded = expandCards(
    withState.filter((item): item is CardWithState => item !== null),
  );

  const ranked = expanded
    .map((cardWithState) => ({
      cardWithState,
      retrievabilityAtExam: getRetrievability(cardWithState.state, examDate),
    }))
    .sort((a, b) => a.retrievabilityAtExam - b.retrievabilityAtExam)
    .map((item, index) => ({
      ...item,
      priority: index + 1,
    }));

  const daysUntilExam = Math.ceil(
    (examDate.getTime() - Date.now()) / 86_400_000,
  );

  const estimatedReviewable =
    daysUntilExam <= 0
      ? dailyReviewCapacity
      : Math.min(ranked.length, daysUntilExam * dailyReviewCapacity);

  return {
    deckId,
    examDate,
    cards: ranked,
    estimatedReviewable,
  };
}
