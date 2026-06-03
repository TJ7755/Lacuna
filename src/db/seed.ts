// First-run seed data: one small, deletable example deck so the app is never empty.

import { db, makeId } from './schema';
import type { Card, Deck } from './types';
import { emptyPerformance } from '../fsrs/grading';
import { defaultExamDate } from '../utils/datetime';

const FLAG_KEY = 'lacuna-seeded';

function exampleCard(
  deckId: string,
  type: Card['type'],
  front: string,
  back: string,
): Card {
  return {
    id: makeId(),
    deckId,
    type,
    front,
    back,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    history: [],
    createdAt: Date.now(),
  };
}

/** Seed the example deck exactly once per browser, and only if the database is empty. */
export async function seedIfFirstRun(): Promise<void> {
  if (localStorage.getItem(FLAG_KEY)) return;
  const deckCount = await db.decks.count();
  if (deckCount > 0) {
    localStorage.setItem(FLAG_KEY, '1');
    return;
  }

  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
    name: 'Welcome to Lacuna',
    examDate: defaultExamDate(createdAt),
    createdAt,
  };

  const cards: Card[] = [
    exampleCard(
      deck.id,
      'front_back',
      'What does the **forgetting curve** describe?',
      'How retrievability of a memory **decays over time** since the last review. Lacuna uses the FSRS-4.5 model:\n\n`R(t, S) = (1 + (19/81)(t/S))^-0.5`',
    ),
    exampleCard(
      deck.id,
      'cloze',
      'The chemical symbol for water is {{c1::H2O}}.',
      '',
    ),
    exampleCard(
      deck.id,
      'cloze',
      'In spaced repetition, the two state variables FSRS tracks are {{c1::stability::how long a memory lasts}} and {{c2::difficulty::how hard a card is}}.',
      '',
    ),
    exampleCard(
      deck.id,
      'front_back',
      'Write the quadratic formula.',
      'For $ax^2 + bx + c = 0$:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
    ),
  ];

  await db.transaction('rw', db.decks, db.cards, db.userPerformance, async () => {
    await db.decks.add(deck);
    await db.cards.bulkAdd(cards);
    await db.userPerformance.add(emptyPerformance(deck.id));
  });

  localStorage.setItem(FLAG_KEY, '1');
}
