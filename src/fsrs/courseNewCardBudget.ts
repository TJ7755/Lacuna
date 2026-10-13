// Daily new-card budget shared by a course's lesson units within one study session.
// Lesson units inherit the course's newCardsPerDay, so applying studyPool to each unit
// separately would let a session over N lessons introduce N times the course cap.

import type { Card, SchedulerConfig } from '../db/types';
import { availableCards, studyPool } from './eligibility';

/** Session cards grouped by course, with each course's admitted new cards memoised by cap. */
export interface CourseNewCardBudget {
  cardsByCourse: Map<string, Card[]>;
  admittedNew: Map<string, Set<string>>;
}

export function courseNewCardBudget(unitCards: Iterable<Card[]>): CourseNewCardBudget {
  const cardsByCourse = new Map<string, Card[]>();
  const seen = new Set<string>();
  for (const cards of unitCards) {
    for (const card of cards) {
      if (!card.courseId || seen.has(card.id)) continue;
      seen.add(card.id);
      const courseCards = cardsByCourse.get(card.courseId);
      if (courseCards) courseCards.push(card);
      else cardsByCourse.set(card.courseId, [card]);
    }
  }
  return { cardsByCourse, admittedNew: new Map() };
}

/** studyPool, but a course's lesson units share one daily new-card budget: each unit
 *  admits only the new cards the course as a whole would admit, so a session over N
 *  lessons introduces at most the course cap rather than N times it. */
export function courseBudgetedStudyPool(
  cards: Card[],
  deck: SchedulerConfig,
  now: number,
  budget: CourseNewCardBudget,
): Card[] {
  const unitPool = studyPool(cards, deck, now);
  const cap = Math.floor(deck.newCardsPerDay ?? 0);
  if (cap <= 0) return unitPool;
  const admittedFor = (courseId: string): Set<string> => {
    const key = `${courseId}:${cap}`;
    let admitted = budget.admittedNew.get(key);
    if (!admitted) {
      admitted = new Set(
        studyPool(budget.cardsByCourse.get(courseId) ?? [], deck, now)
          .filter((card) => card.state === 0)
          .map((card) => card.id),
      );
      budget.admittedNew.set(key, admitted);
    }
    return admitted;
  };
  const unitAdmitted = new Set(unitPool.map((card) => card.id));
  return availableCards(cards, now).filter((card) => {
    if (card.state !== 0) return true;
    return card.courseId ? admittedFor(card.courseId).has(card.id) : unitAdmitted.has(card.id);
  });
}
