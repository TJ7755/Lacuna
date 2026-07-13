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
import type { Sequence, SequenceItem } from './types';
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
