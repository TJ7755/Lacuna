import { expect, it } from 'vitest';
import { makeSessionContext, sessionComplete, sessionServePool } from './session';
import { NOW, card, deck } from './session.testFixtures';

it('allows an explicit early pass and waits for due dates before repeating answers', () => {
  const unit = deck('unit', 30);
  const cards = [
    card('future', unit.id, { reps: 4, state: 2, due: NOW + 86400000 }),
    card('suspended', unit.id, { suspended: true }),
    card('buried', unit.id, { buriedUntil: NOW + 86400000 }),
  ];
  const context = makeSessionContext([unit], 'early-review', cards);
  expect(sessionServePool(cards, context, NOW).map((c) => c.id)).toEqual(['future']);
  expect(sessionComplete(cards, context, NOW)).toBe(false);
  const answered = [{ ...cards[0], reps: 5, due: NOW + 60000 }, ...cards.slice(1)];
  expect(sessionServePool(answered, context, NOW)).toEqual([]);
  expect(sessionComplete(answered, context, NOW)).toBe(true);
  expect(sessionServePool(answered, context, NOW + 60000).map((c) => c.id)).toEqual(['future']);
});
