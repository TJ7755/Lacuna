import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  cardsForSequence,
  createCourse,
  createLesson,
  createSequence,
  deleteSequence,
  listSequences,
  restoreSequence,
  snapshotSequence,
  updateSequence,
} from './repository';
import type { FsrsCardState, Sequence, SequenceItem } from './types';
import { LABEL_CARD_SUFFIX } from './sequenceGeneration';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
    db.sequences.clear(),
  ]);
}

function items(...values: string[]): SequenceItem[] {
  return values.map((value, i) => ({ id: `item-${i}`, value }));
}

describe('createSequence', () => {
  beforeEach(reset);

  it('persists the sequence and generates one card per item', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Groups');

    const sequence = await createSequence(course.id, lesson.id, 'Alkali metals', items('Li', 'Na', 'K'));

    expect(await db.sequences.get(sequence.id)).toEqual(sequence);
    const cards = await cardsForSequence(sequence);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.sequenceItemId).sort()).toEqual(['item-0', 'item-1', 'item-2']);
    // Generated cards get real FSRS defaults and a backing deck, same as any other card.
    for (const card of cards) {
      expect(card.state).toBe(0);
      expect(card.stability).toBeNull();
      expect(card.courseId).toBe(course.id);
      expect(card.primaryLessonId).toBe(lesson.id);
      expect(card.deckId).toBeTruthy();
    }
  });

  it('also generates label cards when generateLabelCards is set and items have labels', async () => {
    const course = await createCourse('Chemistry');
    const withLabels: SequenceItem[] = [
      { id: 'item-0', value: 'Lithium', label: '3' },
      { id: 'item-1', value: 'Sodium', label: '11' },
    ];

    const sequence = await createSequence(course.id, null, 'Alkali metals', withLabels, {
      generateLabelCards: true,
    });

    const cards = await cardsForSequence(sequence);
    expect(cards).toHaveLength(4);
    expect(cards.some((c) => c.sequenceItemId === `item-0${LABEL_CARD_SUFFIX}`)).toBe(true);
    expect(cards.some((c) => c.sequenceItemId === `item-1${LABEL_CARD_SUFFIX}`)).toBe(true);
  });

  it('falls back to "Untitled sequence" for a blank name', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, '   ', items('a'));
    expect(sequence.name).toBe('Untitled sequence');
  });
});

describe('updateSequence', () => {
  beforeEach(reset);

  it('applies the regeneration diff: creates, updates, and deletes cards to match', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', items('F', 'Cl', 'Br'));

    const updated: Sequence = {
      ...sequence,
      items: [
        { id: 'item-0', value: 'Fluorine' }, // changed value -> update
        // item-1 (Cl) removed -> delete
        { id: 'item-2', value: 'Br' }, // unchanged -> no update
        { id: 'item-3', value: 'I' }, // new -> create
      ],
    };
    await updateSequence(updated);

    const cards = await cardsForSequence(updated);
    expect(cards.map((c) => c.sequenceItemId).sort()).toEqual(['item-0', 'item-2', 'item-3']);

    const oldCards = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(oldCards).toHaveLength(0);
  });

  it('preserves FSRS state on a card whose front is regenerated', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', items('F', 'Cl'));
    const [first] = await cardsForSequence(sequence);

    // Simulate real study progress on the first generated card.
    await db.cards.update(first.id, {
      state: 2,
      stability: 12.5,
      difficulty: 4.2,
      reps: 3,
      lapses: 1,
      due: 123456,
      lastReviewed: 100000,
    });

    // Reordering item-1 before item-0 changes item-0's cue window, hence its front.
    const updated: Sequence = {
      ...sequence,
      items: [
        { id: 'item-1', value: 'Cl' },
        { id: 'item-0', value: 'F' },
      ],
    };
    await updateSequence(updated);

    const reloaded = await db.cards.get(first.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.front).not.toBe(first.front);
    expect(reloaded!.state).toBe(2);
    expect(reloaded!.stability).toBe(12.5);
    expect(reloaded!.difficulty).toBe(4.2);
    expect(reloaded!.reps).toBe(3);
    expect(reloaded!.lapses).toBe(1);
    expect(reloaded!.due).toBe(123456);
    expect(reloaded!.lastReviewed).toBe(100000);
  });

  it('keeps each card\'s FSRS state and back exact across a genuine multi-item reorder', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', items('F', 'Cl', 'Br'));
    const cards = await cardsForSequence(sequence);

    // Give each card distinctive, non-default scheduling state so a mix-up between
    // cards (not just a reset to defaults) would be caught.
    const stateByItem: Record<string, { state: FsrsCardState; stability: number; difficulty: number; reps: number; lapses: number; due: number; lastReviewed: number }> = {
      'item-0': { state: 2, stability: 12.5, difficulty: 4.2, reps: 3, lapses: 1, due: 111, lastReviewed: 100 },
      'item-1': { state: 3, stability: 30.1, difficulty: 6.7, reps: 5, lapses: 2, due: 222, lastReviewed: 200 },
      'item-2': { state: 1, stability: 1.9, difficulty: 3.3, reps: 1, lapses: 0, due: 333, lastReviewed: 300 },
    };
    for (const card of cards) {
      await db.cards.update(card.id, stateByItem[card.sequenceItemId!]);
    }
    const backById = new Map(cards.map((c) => [c.id, c.back]));
    const frontById = new Map(cards.map((c) => [c.id, c.front]));

    // Reorder to item-2, item-0, item-1 — the ids (and hence FSRS rows) are stable,
    // but each card's cue-window-dependent front is regenerated.
    const updated: Sequence = {
      ...sequence,
      items: [
        { id: 'item-2', value: 'Br' },
        { id: 'item-0', value: 'F' },
        { id: 'item-1', value: 'Cl' },
      ],
    };
    await updateSequence(updated);

    const reorderedCards = await cardsForSequence(updated);
    expect(reorderedCards).toHaveLength(3);
    for (const card of reorderedCards) {
      const expected = stateByItem[card.sequenceItemId!];
      expect(card.state).toBe(expected.state);
      expect(card.stability).toBe(expected.stability);
      expect(card.difficulty).toBe(expected.difficulty);
      expect(card.reps).toBe(expected.reps);
      expect(card.lapses).toBe(expected.lapses);
      expect(card.due).toBe(expected.due);
      expect(card.lastReviewed).toBe(expected.lastReviewed);
      // Reordering changes cue-window-dependent fronts but must never touch backs.
      expect(card.back).toBe(backById.get(card.id));
      expect(card.front).not.toBe(frontById.get(card.id));
    }
  });
});

describe('deleteSequence', () => {
  beforeEach(reset);

  it('removes the sequence and every card it generated', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', items('F', 'Cl', 'Br'));
    expect(await cardsForSequence(sequence)).toHaveLength(3);

    await deleteSequence(sequence.id);

    expect(await db.sequences.get(sequence.id)).toBeUndefined();
    expect(await cardsForSequence(sequence)).toHaveLength(0);
  });
});

describe('listSequences', () => {
  beforeEach(reset);

  it('returns only sequences for the given course, ordered by createdAt', async () => {
    const course1 = await createCourse('Chemistry');
    const course2 = await createCourse('Biology');
    const a = await createSequence(course1.id, null, 'A', items('x'));
    const b = await createSequence(course1.id, null, 'B', items('y'));
    await createSequence(course2.id, null, 'C', items('z'));

    const result = await listSequences(course1.id);
    expect(result.map((s) => s.id)).toEqual([a.id, b.id]);
  });
});

describe('snapshotSequence / restoreSequence', () => {
  beforeEach(reset);

  it('round-trips the sequence and its cards, preserving FSRS state', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', items('F', 'Cl'));
    const [first] = await cardsForSequence(sequence);
    await db.cards.update(first.id, { state: 2, stability: 8.4, reps: 2 });

    const snapshot = await snapshotSequence(sequence.id);
    expect(snapshot).not.toBeNull();

    await deleteSequence(sequence.id);
    expect(await db.sequences.get(sequence.id)).toBeUndefined();

    await restoreSequence(snapshot!);

    expect(await db.sequences.get(sequence.id)).toEqual(sequence);
    const restoredCard = await db.cards.get(first.id);
    expect(restoredCard).toBeDefined();
    expect(restoredCard!.state).toBe(2);
    expect(restoredCard!.stability).toBe(8.4);
    expect(restoredCard!.reps).toBe(2);
  });

  it('returns null when the sequence no longer exists', async () => {
    expect(await snapshotSequence('missing')).toBeNull();
  });
});
