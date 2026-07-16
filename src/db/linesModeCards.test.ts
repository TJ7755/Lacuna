import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { cardsForSequence, createCourse, createSequence, listSequences } from './repository';
import { linesModeSequencesByCard } from './linesModeCards';
import type { SequenceItem } from './types';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.sequences.clear(),
  ]);
}

describe('linesModeSequencesByCard', () => {
  beforeEach(reset);

  it('maps cards generated from a lines-mode sequence to their owning sequence', async () => {
    const course = await createCourse('Drama');
    const items: SequenceItem[] = [
      { id: 'l0', value: 'To be, or not to be', speaker: 'Hamlet' },
      { id: 'l1', value: 'That is the question', speaker: 'Ophelia' },
    ];
    const sequence = await createSequence(course.id, null, 'Hamlet Act 3', items, {
      mode: 'lines',
      mySpeaker: 'Hamlet',
    });
    const cards = await cardsForSequence(sequence);

    const result = await linesModeSequencesByCard(cards);

    expect(result.size).toBe(cards.length);
    for (const card of cards) {
      expect(result.get(card.id)?.id).toBe(sequence.id);
    }
  });

  it('omits cards generated from a list-mode sequence', async () => {
    const course = await createCourse('Chemistry');
    const items: SequenceItem[] = [
      { id: 'i0', value: 'Hydrogen' },
      { id: 'i1', value: 'Helium' },
    ];
    const sequence = await createSequence(course.id, null, 'Periodic table', items);
    const cards = await cardsForSequence(sequence);

    const result = await linesModeSequencesByCard(cards);

    expect(result.size).toBe(0);
  });

  it('omits ordinary (non-generated) cards', async () => {
    const course = await createCourse('Misc');
    await db.cards.add({
      id: 'plain-card',
      deckId: 'deck-1',
      courseId: course.id,
      type: 'front_back',
      front: 'Q',
      back: 'A',
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
      createdAt: Date.now(),
    });
    const card = await db.cards.get('plain-card');
    expect(card).toBeDefined();

    const result = await linesModeSequencesByCard([card!]);

    expect(result.size).toBe(0);
    // listSequences should not even be called for a card with no sequenceItemId — the
    // filter short-circuits before any query. Sanity-check it stays empty too.
    expect(await listSequences(course.id)).toEqual([]);
  });
});
