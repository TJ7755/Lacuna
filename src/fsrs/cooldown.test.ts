import { describe, expect, it } from 'vitest';
import type { Card, Deck } from '../db/types';
import { makeObjectiveContext } from './objective';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import { applyCooldown, decrementCooldowns, selectNextCard } from './cooldown';

const NOW = 10 * MS_PER_DAY;

const deck: Deck = {
  id: 'deck',
  name: 'Deck',
  examDate: NOW + 7 * MS_PER_DAY,
  createdAt: 0,
  fsrsVersion: 6,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
};

function card(id: string, stability: number): Card {
  return {
    id,
    deckId: deck.id,
    type: 'front_back',
    front: id,
    back: 'answer',
    stability,
    difficulty: 5,
    lastReviewed: NOW,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    suspended: false,
    buriedUntil: null,
  };
}

describe('applyCooldown', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [5, 4],
    [6, 5],
    [20, 5],
  ])('uses deck size %i to set cooldown %i', (deckSize, expected) => {
    const cooldowns = new Map<string, number>();

    applyCooldown(cooldowns, 'card', deckSize);

    expect(cooldowns.get('card')).toBe(expected);
  });
});

describe('selectNextCard', () => {
  const oc = makeObjectiveContext(deck);
  const weakest = card('weakest', 0.5);
  const middle = card('middle', 5);
  const strongest = card('strongest', 100);

  it('skips a higher-priority card while its cooldown is active', () => {
    const next = selectNextCard(
      [strongest, middle, weakest],
      oc,
      new Map([[weakest.id, 2]]),
      NOW,
    );

    expect(next?.id).toBe(strongest.id);
  });

  it('serves the card with the shortest cooldown when every card is cooling', () => {
    const next = selectNextCard(
      [weakest, middle, strongest],
      oc,
      new Map([
        [weakest.id, 3],
        [middle.id, 1],
        [strongest.id, 2],
      ]),
      NOW,
    );

    expect(next?.id).toBe(middle.id);
  });

  it('breaks equal cooldowns by objective priority', () => {
    const next = selectNextCard(
      [strongest, middle, weakest],
      oc,
      new Map([
        [strongest.id, 2],
        [middle.id, 2],
        [weakest.id, 2],
      ]),
      NOW,
    );

    expect(next?.id).toBe(weakest.id);
  });

  it('returns null for an empty queue', () => {
    expect(selectNextCard([], oc, new Map(), NOW)).toBeNull();
  });
});

describe('decrementCooldowns', () => {
  it('preserves the reviewed card, decrements other cards and removes expired entries', () => {
    const cooldowns = new Map([
      ['reviewed', 5],
      ['waiting', 3],
      ['ready', 1],
    ]);

    decrementCooldowns(cooldowns, 'reviewed');

    expect([...cooldowns.entries()]).toEqual([
      ['reviewed', 5],
      ['waiting', 2],
    ]);
  });
});
