import { describe, expect, it } from 'vitest';
import type { Card } from '../db/repositories/cards';
import type { FsrsState } from '../db/repositories/fsrs';
import type { CardWithState } from './fsrs';
import { expandCards } from './cardExpansion';
import type { OcclusionData, SequenceCard, SequenceItem } from '../types';

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-1',
    deck_id: 'deck-1',
    card_type: 'basic',
    front: 'Front',
    back: 'Back',
    cloze_text: null,
    image_url: null,
    occlusion_data: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<FsrsState>): FsrsState {
  return {
    id: 'state-1',
    card_id: 'card-1',
    stability: 0,
    difficulty: 0,
    due: new Date('2026-01-01T00:00:00.000Z'),
    last_review: null,
    rating_history: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeCardWithState(
  cardOverrides: Partial<Card>,
  stateOverrides: Partial<FsrsState> = {},
): CardWithState {
  const card = makeCard(cardOverrides);
  const state = makeState({ card_id: card.id, ...stateOverrides });
  return { card, state };
}

describe('expandCards', () => {
  it('produces one item for a basic card', () => {
    const input = [makeCardWithState({ id: 'basic-1', card_type: 'basic' })];

    const expanded = expandCards(input);
    const first = expanded[0];
    if (first.queueType !== 'card') {
      throw new Error('Expected card queue item');
    }

    expect(expanded).toHaveLength(1);
    expect(first.card.id).toBe('basic-1');
    expect(first.activeIndex).toBeUndefined();
    expect(first.activeRectId).toBeUndefined();
  });

  it('produces one item for a cloze card with one index', () => {
    const input = [
      makeCardWithState({
        id: 'cloze-1',
        card_type: 'cloze',
        cloze_text: 'Capital is {{c1::Paris}}.',
      }),
    ];

    const expanded = expandCards(input);
    const first = expanded[0];
    if (first.queueType !== 'card') {
      throw new Error('Expected card queue item');
    }

    expect(expanded).toHaveLength(1);
    expect(first.card.id).toBe('cloze-1');
    expect(first.activeIndex).toBe(1);
  });

  it('produces one item per index for a cloze card with three indices', () => {
    const input = [
      makeCardWithState({
        id: 'cloze-3',
        card_type: 'cloze',
        cloze_text: '{{c1::A}} {{c2::B}} {{c3::C}}',
      }),
    ];

    const expanded = expandCards(input);

    expect(expanded).toHaveLength(3);
    expect(
      expanded
        .filter((item) => item.queueType === 'card')
        .map((item) => item.activeIndex),
    ).toEqual([1, 2, 3]);
  });

  it('produces one item per rect for image occlusion cards', () => {
    const occlusionData: OcclusionData = [
      { id: 'rect-1', label: 'One', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: 'rect-2', label: 'Two', x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ];

    const input = [
      makeCardWithState({
        id: 'img-1',
        card_type: 'image_occlusion',
        image_url: 'blob:test',
        occlusion_data: occlusionData,
      }),
    ];

    const expanded = expandCards(input);

    expect(expanded).toHaveLength(2);
    expect(
      expanded
        .filter((item) => item.queueType === 'card')
        .map((item) => item.activeRectId),
    ).toEqual(['rect-1', 'rect-2']);
  });

  it('expands mixed arrays to the expected total count', () => {
    const input = [
      makeCardWithState({ id: 'basic-mix', card_type: 'basic' }),
      makeCardWithState({
        id: 'cloze-mix',
        card_type: 'cloze',
        cloze_text: '{{c1::A}} {{c2::B}} {{c3::C}}',
      }),
      makeCardWithState({
        id: 'img-mix',
        card_type: 'image_occlusion',
        image_url: 'blob:test',
        occlusion_data: [
          {
            id: 'mix-rect-1',
            label: 'One',
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
          },
          {
            id: 'mix-rect-2',
            label: 'Two',
            x: 0.4,
            y: 0.4,
            width: 0.2,
            height: 0.2,
          },
        ],
      }),
    ];

    const expanded = expandCards(input);

    expect(expanded).toHaveLength(6);
  });

  it('expands sequence cards into due chain items with title/previous prompts', () => {
    const sequenceCard: SequenceCard = {
      id: 'seq-1',
      deck_id: 'deck-1',
      title: 'Group 1 elements',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      deleted_at: null,
    };
    const items: SequenceItem[] = [
      {
        id: 'item-1',
        sequence_card_id: 'seq-1',
        position: 1,
        content: 'Hydrogen',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'item-2',
        sequence_card_id: 'seq-1',
        position: 2,
        content: 'Lithium',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        deleted_at: null,
      },
    ];
    const itemStates = [
      makeState({ id: 'state-item-1', card_id: 'item-1' }),
      makeState({ id: 'state-item-2', card_id: 'item-2' }),
    ];

    const expanded = expandCards(
      [],
      [{ card: sequenceCard, items, itemStates }],
    );

    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toMatchObject({
      cardType: 'sequence_chain',
      cardId: 'seq-1',
      itemId: 'item-1',
      position: 1,
      prompt: 'Group 1 elements',
      answer: 'Hydrogen',
      fsrsStateId: 'state-item-1',
    });
    expect(expanded[1]).toMatchObject({
      prompt: 'Hydrogen',
      answer: 'Lithium',
      fsrsStateId: 'state-item-2',
    });
  });

  it('excludes sequence items that are not yet due', () => {
    const sequenceCard: SequenceCard = {
      id: 'seq-2',
      deck_id: 'deck-1',
      title: 'Reactivity series',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      deleted_at: null,
    };
    const items: SequenceItem[] = [
      {
        id: 'item-a',
        sequence_card_id: 'seq-2',
        position: 1,
        content: 'Potassium',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        deleted_at: null,
      },
    ];
    const itemStates = [
      makeState({
        id: 'future-state',
        card_id: 'item-a',
        due: new Date(Date.now() + 86_400_000),
      }),
    ];

    const expanded = expandCards(
      [],
      [{ card: sequenceCard, items, itemStates }],
    );
    expect(expanded).toHaveLength(0);
  });
});
