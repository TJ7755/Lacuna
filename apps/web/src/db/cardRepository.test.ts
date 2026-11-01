import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createBasicReversedPair,
  createCard,
  createCardWithReverse,
  createCourse,
  createLesson,
  createLessonBasicReversedPair,
  createLessonCard,
  createLessonCardWithReverse,
  ensureLessonDeck,
  ensureCourseBankDeck,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  createCards,
  checkDuplicate,
  checkDuplicatesBatch,
  updateCard,
} from './repository';
import { reset } from './courseRepository.testFixtures';

describe('Card duplicate scope', () => {
  beforeEach(reset);

  it('normalises both sides while respecting type, scheduling unit and excluded identity', async () => {
    const course = await createCourse('Duplicates');
    const other = await createCourse('Other');
    const card = await createCard(course.id, 'front_back', '  The  Prompt ', 'The\nAnswer');
    const cloze = await createCard(course.id, 'cloze', 'The Prompt', 'The Answer');
    await createCard(other.id, 'front_back', 'The Prompt', 'The Answer');

    expect(await checkDuplicate(course.id, 'front_back', 'the prompt', 'the answer')).toEqual(card);
    expect(await checkDuplicate(course.id, 'cloze', 'the prompt', 'the answer')).toEqual(cloze);
    expect(
      await checkDuplicate(course.id, 'front_back', 'the prompt', 'the answer', card.id),
    ).toBeUndefined();
    expect(
      await checkDuplicatesBatch(course.id, [
        { type: 'front_back', front: 'THE PROMPT', back: 'the answer' },
        { type: 'front_back', front: 'New prompt', back: 'New answer' },
        { type: 'front_back', front: ' new  prompt ', back: ' NEW ANSWER ' },
        { type: 'cloze', front: 'New prompt', back: 'New answer' },
        { type: 'front_back', front: 'The Prompt', back: 'Different answer' },
      ]),
    ).toEqual(new Set([0, 2]));
  });
});

describe('createCard opts', () => {
  beforeEach(reset);

  it('stamps courseId and primaryLessonId when opts are provided', async () => {
    const deck = await createCourse('Test deck');
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'L1');

    const card = await createCard(deck.id, 'front_back', 'q', 'a', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBe(lesson.id);
  });

  it('persists a structured item payload when provided', async () => {
    const deck = await createCourse('Test deck');
    const payload = {
      v: 1 as const,
      kind: 'numeric' as const,
      answer: { kind: 'exact' as const, value: '4' },
    };

    const card = await createCard(deck.id, 'front_back', '2 + 2', '', [], { payload });

    expect(card.payload).toEqual(payload);
    expect((await db.cards.get(card.id))?.payload).toEqual(payload);
  });

  it('infers course ownership when opts are omitted', async () => {
    const deck = await createCourse('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(deck.id);
    expect(card.primaryLessonId).toBeNull();
  });
});

describe('ensureLessonDeck', () => {
  beforeEach(reset);

  it('creates a scheduling unit and performance row for a new lesson', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);

    const deck = await db.schedulingUnits.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Lesson 1');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.fsrsVersion).toBe(course.fsrsVersion);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.schedulingPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing backing deck on a second call for the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);
    // Simulate a card already living in this lesson's deck, as createLessonCard would leave behind.
    await createCard(deckId, 'front_back', 'q', 'a', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    const deckIdAgain = await ensureLessonDeck(course.id, lesson.id);

    expect(deckIdAgain).toBe(deckId);
    expect(await db.schedulingUnits.count()).toBe(2);
  });
});

describe('createLessonCard', () => {
  beforeEach(reset);

  it('creates a card visible via primaryLessonId and backed by a real deck', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBe(lesson.id);
    expect(await db.schedulingUnits.get(card.schedulingUnitId)).toBeDefined();

    const lessonCards = await db.cards.where('primaryLessonId').equals(lesson.id).toArray();
    expect(lessonCards.map((c) => c.id)).toEqual([card.id]);
  });

  it('reuses the same backing deck for a second card in the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const first = await createLessonCard(course.id, lesson.id, 'front_back', 'q1', 'a1');
    const second = await createLessonCard(course.id, lesson.id, 'front_back', 'q2', 'a2');

    expect(second.schedulingUnitId).toBe(first.schedulingUnitId);
    expect(await db.schedulingUnits.count()).toBe(2);
  });

  it('createLessonCardWithReverse stamps courseId/primaryLessonId on both cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const { card, reverse } = await createLessonCardWithReverse(course.id, lesson.id, 'q', 'a');

    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBe(lesson.id);
    }
  });

  it('createLessonBasicReversedPair stamps courseId/primaryLessonId on both cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const { card, reverse } = await createLessonBasicReversedPair(course.id, lesson.id, 'q', 'a');

    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBe(lesson.id);
    }
    expect(card.reverseCardId).toBe(reverse.id);
    expect(reverse.reverseCardId).toBe(card.id);
  });
});

describe('createCardWithReverse / createBasicReversedPair without opts', () => {
  beforeEach(reset);

  it('infer course ownership on both cards when opts are omitted', async () => {
    const deck = await createCourse('Test deck');

    const { card, reverse } = await createCardWithReverse(deck.id, 'q', 'a');
    expect(card.courseId).toBe(deck.id);
    expect(reverse.courseId).toBe(deck.id);

    const { card: card2, reverse: reverse2 } = await createBasicReversedPair(deck.id, 'q2', 'a2');
    expect(card2.courseId).toBe(deck.id);
    expect(reverse2.courseId).toBe(deck.id);
  });
});

describe('ensureCourseBankDeck', () => {
  beforeEach(reset);

  it('resolves the course scheduling unit and performance row', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });

    const deckId = await ensureCourseBankDeck(course.id);

    const deck = await db.schedulingUnits.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Course');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.schedulingPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing bank deck on a second call, ignoring lesson-assigned cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    const deckId = await ensureCourseBankDeck(course.id);
    await createCard(deckId, 'front_back', 'q2', 'a2', [], {
      courseId: course.id,
      primaryLessonId: null,
    });

    const deckIdAgain = await ensureCourseBankDeck(course.id);

    expect(deckIdAgain).toBe(deckId);
    // One lesson deck plus one bank deck.
    expect(await db.schedulingUnits.count()).toBe(2);
  });
});

describe('createCourseCard', () => {
  beforeEach(reset);

  it('creates a card with courseId set and primaryLessonId null, backed by a real deck', async () => {
    const course = await createCourse('Course');

    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBeNull();
    expect(await db.schedulingUnits.get(card.schedulingUnitId)).toBeDefined();
  });

  it('reuses the same bank deck for a second unassigned card', async () => {
    const course = await createCourse('Course');

    const first = await createCourseCard(course.id, 'front_back', 'q1', 'a1');
    const second = await createCourseCard(course.id, 'front_back', 'q2', 'a2');

    expect(second.deckId).toBe(first.deckId);
    expect(await db.schedulingUnits.count()).toBe(1);
  });

  it('createCourseCardWithReverse and createCourseBasicReversedPair stamp courseId with a null primaryLessonId', async () => {
    const course = await createCourse('Course');

    const { card, reverse } = await createCourseCardWithReverse(course.id, 'q', 'a');
    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBeNull();
    }

    const pair = await createCourseBasicReversedPair(course.id, 'q2', 'a2');
    expect(pair.card.primaryLessonId).toBeNull();
    expect(pair.reverse.primaryLessonId).toBeNull();
    expect(pair.card.reverseCardId).toBe(pair.reverse.id);
  });
});

describe('createCardWithReverse', () => {
  beforeEach(async () => {
    await Promise.all([db.schedulingUnits.clear(), db.cards.clear(), db.concepts.clear()]);
  });

  it('creates two independent cards with swapped sides and shared tags', async () => {
    const deck = await createCourse('Vocab');
    const { card, reverse } = await createCardWithReverse(deck.id, 'bonjour', 'hello', ['french']);

    expect(card.front).toBe('bonjour');
    expect(card.back).toBe('hello');
    expect(reverse.front).toBe('hello');
    expect(reverse.back).toBe('bonjour');
    // Distinct rows, distinct FSRS state.
    expect(card.id).not.toBe(reverse.id);
    expect(reverse.reps).toBe(0);
    expect(reverse.lastReviewed).toBeNull();
    expect(card.tags).toEqual(['french']);
    expect(reverse.tags).toEqual(['french']);
    expect(card.conceptId).toBe(reverse.conceptId);
    expect(await db.concepts.get(card.conceptId)).toMatchObject({
      courseId: deck.id,
      scope: 'course',
      provisional: false,
    });
    expect(await db.cards.where('schedulingUnitId').equals(deck.id).count()).toBe(2);
  });
});

describe('structured item payload validation', () => {
  beforeEach(async () => {
    await Promise.all([
      db.schedulingUnits.clear(),
      db.cards.clear(),
      db.userPerformance.clear(),
      db.assets.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('rejects malformed payloads before create and update writes', async () => {
    const deck = await createCourse('Payload validation');
    const invalidPayload = { v: 1, kind: 'working', scheme: [] } as never;

    await expect(
      createCard(deck.id, 'front_back', 'Question', '', [], { payload: invalidPayload }),
    ).rejects.toThrow('Invalid structured item payload.');
    expect(await db.cards.count()).toBe(0);

    const card = await createCard(deck.id, 'front_back', 'Question', 'Answer');
    await expect(updateCard(card.id, { payload: invalidPayload })).rejects.toThrow(
      'Invalid structured item payload.',
    );
    expect((await db.cards.get(card.id))?.payload).toBeUndefined();
  });

  it('validates every draft before a bulk create and keeps payloads off cloze cards', async () => {
    const deck = await createCourse('Payload validation');
    const invalidPayload = { v: 1, kind: 'working', scheme: [] } as never;

    await expect(
      createCards(deck.id, [
        { type: 'front_back', front: 'Q1', back: '', payload: invalidPayload },
        { type: 'front_back', front: 'Q2', back: '' },
      ]),
    ).rejects.toThrow('Invalid structured item payload.');
    expect(await db.cards.count()).toBe(0);

    await expect(
      createCard(deck.id, 'cloze', '{{c1::answer}}', '', [], {
        payload: { v: 1, kind: 'scaffold' },
      }),
    ).rejects.toThrow('Structured item payloads require a front_back card.');
  });
});
