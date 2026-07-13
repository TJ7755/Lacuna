import { describe, expect, it } from 'vitest';
import {
  diffRegeneration,
  generateCards,
  isLabelCardId,
  LABEL_CARD_SUFFIX,
  parseSequenceFront,
} from './sequenceGeneration';
import type { Card, Sequence, SequenceItem } from './types';

function item(id: string, value: string, extra?: Partial<SequenceItem>): SequenceItem {
  return { id, value, ...extra };
}

function makeSequence(overrides: Partial<Sequence> = {}): Sequence {
  return {
    id: 'seq-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    name: 'Noble gases',
    items: [item('a', 'Helium'), item('b', 'Neon'), item('c', 'Argon')],
    cueWindow: 2,
    createdAt: 0,
    ...overrides,
  };
}

/** Build a Card record (only the fields diffRegeneration/generateCards care about matter). */
function card(overrides: Partial<Card> & { id: string; sequenceItemId: string; front: string; back: string }): Card {
  return {
    deckId: 'deck-1',
    type: 'front_back',
    stability: 5,
    difficulty: 3,
    lastReviewed: 1000,
    reps: 2,
    lapses: 0,
    state: 2,
    due: 2000,
    scheduledDays: 10,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('generateCards', () => {
  it('cues the first item by sequence name alone', () => {
    const seq = makeSequence();
    const [first] = generateCards(seq);
    expect(first.front).toBe('**Noble gases**\n\nFirst item?');
    expect(first.back).toBe('Helium');
    expect(first.sequenceItemId).toBe('a');
    expect(first.courseId).toBe('course-1');
    expect(first.primaryLessonId).toBe('lesson-1');
  });

  it('cues item 2 with only the preceding item when cueWindow allows it (window=2, position=1 -> 1 cue)', () => {
    const seq = makeSequence();
    const [, second] = generateCards(seq);
    expect(second.front).toBe('**Noble gases**\n\nHelium');
    expect(second.back).toBe('Neon');
  });

  it('cues item 3 with both preceding items under cueWindow=2', () => {
    const seq = makeSequence();
    const [, , third] = generateCards(seq);
    expect(third.front).toBe('**Noble gases**\n\nHelium\n\nNeon');
    expect(third.back).toBe('Argon');
  });

  it('cueWindow=0 means every item (after the first) is cued by the name alone', () => {
    const seq = makeSequence({ cueWindow: 0 });
    const fronts = generateCards(seq).map((p) => p.front);
    expect(fronts).toEqual([
      '**Noble gases**\n\nFirst item?',
      '**Noble gases**\n\nFirst item?',
      '**Noble gases**\n\nFirst item?',
    ]);
  });

  it('cueWindow=1 cues by only the immediately preceding item', () => {
    const seq = makeSequence({ cueWindow: 1 });
    const fronts = generateCards(seq).map((p) => p.front);
    expect(fronts).toEqual([
      '**Noble gases**\n\nFirst item?',
      '**Noble gases**\n\nHelium',
      '**Noble gases**\n\nNeon',
    ]);
  });

  it('cueWindow larger than the list clamps to all preceding items', () => {
    const seq = makeSequence({ cueWindow: 50 });
    const fronts = generateCards(seq).map((p) => p.front);
    expect(fronts[2]).toBe('**Noble gases**\n\nHelium\n\nNeon');
  });

  it('a single-item sequence generates one first-item card', () => {
    const seq = makeSequence({ items: [item('only', 'Xenon')] });
    const payloads = generateCards(seq);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      front: '**Noble gases**\n\nFirst item?',
      back: 'Xenon',
      sequenceItemId: 'only',
    });
  });

  it('includes the chunk label in the header for chunked items', () => {
    const seq = makeSequence({
      items: [
        item('a', 'Helium', { chunkIndex: 0 }),
        item('b', 'Neon', { chunkIndex: 0 }),
        item('c', 'Argon', { chunkIndex: 1 }),
      ],
      chunkLabels: ['Group 1', 'Group 2'],
      cueWindow: 2,
    });
    const fronts = generateCards(seq).map((p) => p.front);
    expect(fronts[0]).toBe('**Noble gases — Group 1**\n\nFirst item?');
    expect(fronts[1]).toBe('**Noble gases — Group 1**\n\nHelium');
    // Crossing a chunk boundary: header switches to the new chunk, cues still include prior item.
    expect(fronts[2]).toBe('**Noble gases — Group 2**\n\nHelium\n\nNeon');
  });

  it('generates no label cards by default', () => {
    const seq = makeSequence({ items: [item('a', 'Helium', { label: '2' })] });
    const payloads = generateCards(seq);
    expect(payloads).toHaveLength(1);
  });

  it('generates label cards when enabled and the item has a label', () => {
    const seq = makeSequence({
      generateLabelCards: true,
      items: [item('a', 'Helium', { label: '2' }), item('b', 'Neon')],
    });
    const payloads = generateCards(seq);
    // 'a' has a label -> positional + label card; 'b' has no label -> positional only.
    expect(payloads).toHaveLength(3);
    const labelCard = payloads.find((p) => p.sequenceItemId === `a${LABEL_CARD_SUFFIX}`);
    expect(labelCard).toMatchObject({ front: '2 → ?', back: 'Helium' });
    expect(isLabelCardId(labelCard!.sequenceItemId)).toBe(true);
    expect(isLabelCardId('a')).toBe(false);
  });

  it('parseSequenceFront recovers the header and body', () => {
    const seq = makeSequence();
    const [, , third] = generateCards(seq);
    expect(parseSequenceFront(third.front)).toEqual({
      header: '**Noble gases**',
      body: 'Helium\n\nNeon',
    });
  });
});

describe('diffRegeneration', () => {
  const seq = makeSequence(); // a: Helium, b: Neon, c: Argon; cueWindow 2

  function existingFromGenerated(overrides: Record<string, Partial<Card>> = {}): Card[] {
    return generateCards(seq).map((p, i) =>
      card({
        id: `card-${p.sequenceItemId}`,
        sequenceItemId: p.sequenceItemId,
        front: p.front,
        back: p.back,
        createdAt: i,
        ...overrides[p.sequenceItemId],
      }),
    );
  }

  it('produces no diff when nothing changed', () => {
    const existing = existingFromGenerated();
    expect(diffRegeneration(seq, existing)).toEqual({ creates: [], updates: [], deletes: [] });
  });

  it('edits an item value in place: its own back updates, and follower fronts update, memory state untouched', () => {
    const existing = existingFromGenerated();
    const edited = makeSequence({
      items: [item('a', 'Helium'), item('b', 'Krypton' /* was Neon */), item('c', 'Argon')],
    });
    const diff = diffRegeneration(edited, existing);
    expect(diff.creates).toEqual([]);
    expect(diff.deletes).toEqual([]);
    expect(diff.updates).toEqual(
      expect.arrayContaining([
        { id: 'card-b', back: 'Krypton' },
        { id: 'card-c', front: '**Noble gases**\n\nHelium\n\nKrypton' },
      ]),
    );
    expect(diff.updates).toHaveLength(2);
    // No update entry ever carries a scheduling field.
    for (const u of diff.updates) {
      expect(u).not.toHaveProperty('stability');
      expect(u).not.toHaveProperty('difficulty');
      expect(u).not.toHaveProperty('due');
      expect(u).not.toHaveProperty('state');
      expect(u).not.toHaveProperty('history');
    }
  });

  it('inserting an item at the head shifts fronts but keeps existing cards (memory state preserved)', () => {
    const existing = existingFromGenerated();
    const withInsert = makeSequence({
      items: [item('z', 'Radon'), item('a', 'Helium'), item('b', 'Neon'), item('c', 'Argon')],
    });
    const diff = diffRegeneration(withInsert, existing);
    expect(diff.deletes).toEqual([]);
    expect(diff.creates).toEqual([
      expect.objectContaining({ sequenceItemId: 'z', front: '**Noble gases**\n\nFirst item?', back: 'Radon' }),
    ]);
    // a is now position 1 (cued by Radon), b position 2 (cued by Radon, Helium), c position 3 (cued by Helium, Neon - window 2).
    expect(diff.updates).toEqual(
      expect.arrayContaining([
        { id: 'card-a', front: '**Noble gases**\n\nRadon' },
        { id: 'card-b', front: '**Noble gases**\n\nRadon\n\nHelium' },
      ]),
    );
    // c's cue window (Helium, Neon) is unchanged by a head insert two positions away.
    expect(diff.updates.find((u) => u.id === 'card-c')).toBeUndefined();
  });

  it('inserting an item in the middle regenerates only the affected fronts', () => {
    const existing = existingFromGenerated();
    const withInsert = makeSequence({
      items: [item('a', 'Helium'), item('z', 'Krypton'), item('b', 'Neon'), item('c', 'Argon')],
    });
    const diff = diffRegeneration(withInsert, existing);
    expect(diff.creates).toEqual([
      expect.objectContaining({ sequenceItemId: 'z', front: '**Noble gases**\n\nHelium', back: 'Krypton' }),
    ]);
    expect(diff.updates).toEqual(
      expect.arrayContaining([
        { id: 'card-b', front: '**Noble gases**\n\nHelium\n\nKrypton' },
        { id: 'card-c', front: '**Noble gases**\n\nKrypton\n\nNeon' },
      ]),
    );
    expect(diff.updates).toHaveLength(2);
  });

  it('inserting an item at the tail only creates the new card', () => {
    const existing = existingFromGenerated();
    const withInsert = makeSequence({
      items: [item('a', 'Helium'), item('b', 'Neon'), item('c', 'Argon'), item('z', 'Krypton')],
    });
    const diff = diffRegeneration(withInsert, existing);
    expect(diff.deletes).toEqual([]);
    expect(diff.updates).toEqual([]);
    expect(diff.creates).toEqual([
      expect.objectContaining({ sequenceItemId: 'z', front: '**Noble gases**\n\nNeon\n\nArgon', back: 'Krypton' }),
    ]);
  });

  it('reordering two items regenerates the fronts of items whose cue window changed', () => {
    const existing = existingFromGenerated();
    const reordered = makeSequence({
      items: [item('b', 'Neon'), item('a', 'Helium'), item('c', 'Argon')],
    });
    const diff = diffRegeneration(reordered, existing);
    expect(diff.creates).toEqual([]);
    expect(diff.deletes).toEqual([]);
    expect(diff.updates).toEqual(
      expect.arrayContaining([
        { id: 'card-b', front: '**Noble gases**\n\nFirst item?' },
        { id: 'card-a', front: '**Noble gases**\n\nNeon' },
        { id: 'card-c', front: '**Noble gases**\n\nNeon\n\nHelium' },
      ]),
    );
    expect(diff.updates).toHaveLength(3);
  });

  it('deleting the head item removes its card and regenerates the new first item and its followers', () => {
    const existing = existingFromGenerated();
    const withoutHead = makeSequence({ items: [item('b', 'Neon'), item('c', 'Argon')] });
    const diff = diffRegeneration(withoutHead, existing);
    expect(diff.deletes).toEqual(['card-a']);
    expect(diff.creates).toEqual([]);
    expect(diff.updates).toEqual(
      expect.arrayContaining([
        { id: 'card-b', front: '**Noble gases**\n\nFirst item?' },
        { id: 'card-c', front: '**Noble gases**\n\nNeon' },
      ]),
    );
  });

  it('deleting a middle item removes its card and regenerates its follower', () => {
    const existing = existingFromGenerated();
    const withoutMiddle = makeSequence({ items: [item('a', 'Helium'), item('c', 'Argon')] });
    const diff = diffRegeneration(withoutMiddle, existing);
    expect(diff.deletes).toEqual(['card-b']);
    expect(diff.updates).toEqual([{ id: 'card-c', front: '**Noble gases**\n\nHelium' }]);
    expect(diff.creates).toEqual([]);
  });

  it('deleting the tail item only removes its card', () => {
    const existing = existingFromGenerated();
    const withoutTail = makeSequence({ items: [item('a', 'Helium'), item('b', 'Neon')] });
    const diff = diffRegeneration(withoutTail, existing);
    expect(diff.deletes).toEqual(['card-c']);
    expect(diff.updates).toEqual([]);
    expect(diff.creates).toEqual([]);
  });

  it('combines an edit, an insert, and a delete in one regeneration pass', () => {
    const existing = existingFromGenerated();
    const combined = makeSequence({
      items: [
        item('a', 'Helium'),
        item('z', 'Krypton'), // inserted mid
        item('c', 'Xenon' /* edited, was Argon */),
        // 'b' (Neon) deleted
      ],
    });
    const diff = diffRegeneration(combined, existing);
    expect(diff.deletes).toEqual(['card-b']);
    expect(diff.creates).toEqual([
      expect.objectContaining({ sequenceItemId: 'z', front: '**Noble gases**\n\nHelium', back: 'Krypton' }),
    ]);
    expect(diff.updates).toEqual(
      expect.arrayContaining([{ id: 'card-c', front: '**Noble gases**\n\nHelium\n\nKrypton', back: 'Xenon' }]),
    );
    expect(diff.updates).toHaveLength(1);
  });

  it('toggling generateLabelCards on creates label cards for labelled items', () => {
    const labelled = makeSequence({
      items: [item('a', 'Helium', { label: '2' }), item('b', 'Neon', { label: '10' }), item('c', 'Argon')],
    });
    const existing = existingFromGenerated(); // generated without labels toggle
    const diff = diffRegeneration(makeSequence({ ...labelled, generateLabelCards: true }), existing);
    expect(diff.creates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequenceItemId: `a${LABEL_CARD_SUFFIX}`, front: '2 → ?', back: 'Helium' }),
        expect.objectContaining({ sequenceItemId: `b${LABEL_CARD_SUFFIX}`, front: '10 → ?', back: 'Neon' }),
      ]),
    );
    expect(diff.creates).toHaveLength(2);
    expect(diff.deletes).toEqual([]);
  });

  it('toggling generateLabelCards off deletes the previously generated label cards', () => {
    const labelled = makeSequence({
      generateLabelCards: true,
      items: [item('a', 'Helium', { label: '2' }), item('b', 'Neon'), item('c', 'Argon')],
    });
    const existing = existingFromGenerated.call(null); // baseline positional cards
    // Simulate label cards already existing from a prior generation with the toggle on.
    const existingWithLabel = [
      ...existing,
      card({ id: 'card-a-label', sequenceItemId: `a${LABEL_CARD_SUFFIX}`, front: '2 → ?', back: 'Helium' }),
    ];
    const diff = diffRegeneration(makeSequence({ ...labelled, generateLabelCards: false }), existingWithLabel);
    expect(diff.deletes).toEqual(['card-a-label']);
    expect(diff.creates).toEqual([]);
    expect(diff.updates).toEqual([]);
  });
});
