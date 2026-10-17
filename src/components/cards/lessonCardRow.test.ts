import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/types';
import {
  cardKindLabel,
  cardScheduleLabel,
  learntCardCount,
  orderOcclusionSiblings,
  plainFront,
} from './lessonCardRow';

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c',
    conceptId: 'k',
    deckId: 'd',
    schedulingUnitId: 'd',
    type: 'front_back',
    front: 'What is **ATP**?',
    back: 'Energy',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('lessonCardRow', () => {
  it('reduces markdown and cloze notation to plain words', () => {
    expect(plainFront(card())).toBe('What is ATP?');
    expect(plainFront(card({ type: 'cloze', front: 'Splits in the {{c1::cytoplasm::where?}}.' }))).toBe(
      'Splits in the cytoplasm.',
    );
    expect(plainFront(card({ front: 'What is the derivative of $e^x$?' }))).toBe(
      'What is the derivative of e^x?',
    );
  });

  it('names each card kind', () => {
    expect(cardKindLabel(card())).toBe('Front / back');
    expect(cardKindLabel(card({ type: 'cloze' }))).toBe('Cloze');
    expect(cardKindLabel(card({ type: 'basic_reversed' }))).toBe('Reversed');
    expect(cardKindLabel(card({ occlusionRegionId: 'r1' }))).toBe('Occlusion');
  });

  it('counts only cards that have left the New state as learnt', () => {
    expect(
      learntCardCount([card(), card({ state: 2, lastReviewed: 1 }), card({ state: 1, lastReviewed: 2 })]),
    ).toBe(2);
  });

  it('labels when a card next comes up, agreeing with the Due filter', () => {
    const now = new Date(2026, 9, 7, 23, 0).getTime();
    const reviewed = { lastReviewed: now - 1, state: 2 as const };
    expect(cardScheduleLabel(card(), now)).toEqual({ label: 'New', tone: 'new' });
    expect(cardScheduleLabel(card({ ...reviewed, due: now }), now).label).toBe('Due');
    expect(cardScheduleLabel(card({ ...reviewed, due: now + 30 * 60_000 }), now).label).toBe(
      'Later today',
    );
    // Ten hours away, but on the next calendar day.
    expect(
      cardScheduleLabel(card({ ...reviewed, due: new Date(2026, 9, 8, 9).getTime() }), now).label,
    ).toBe('Tomorrow');
    expect(
      cardScheduleLabel(card({ ...reviewed, due: new Date(2026, 9, 11, 9).getTime() }), now)
        .label,
    ).toBe('In 4 days');
    expect(cardScheduleLabel(card({ ...reviewed, due: now, suspended: true }), now)).toEqual({
      label: 'Suspended',
      tone: 'paused',
    });
    expect(
      cardScheduleLabel(card({ ...reviewed, due: now, buriedUntil: now + 1 }), now).label,
    ).toBe('Buried');
  });

  it('gathers the cards of an occlusion in region order where the first appears', () => {
    const occlusion = { id: 'o', regions: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] } as never;
    const a = card({ id: 'a' });
    const r3 = card({ id: 'r3', occlusionRegionId: 'r3' });
    const b = card({ id: 'b' });
    const r1 = card({ id: 'r1', occlusionRegionId: 'r1' });
    const r2 = card({ id: 'r2', occlusionRegionId: 'r2' });
    expect(orderOcclusionSiblings([a, r3, b, r1, r2], [occlusion]).map((c) => c.id)).toEqual([
      'a',
      'r1',
      'r2',
      'r3',
      'b',
    ]);
  });
});
