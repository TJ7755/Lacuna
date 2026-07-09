import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createBasicReversedPair,
  createCard,
  createCardWithReverse,
  createCourse,
  createCourseExamDate,
  createDeck,
  createLesson,
  createLessonBasicReversedPair,
  createLessonCard,
  createLessonCardWithReverse,
  createNote,
  createPracticeNode,
  deleteCourse,
  deleteLesson,
  ensureLessonDeck,
  ensureCourseBankDeck,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  assignCardsToLesson,
  linkCardToLesson,
  listCourseExamDates,
  listLessonCardLinks,
  listLessons,
  listNotes,
  listPracticeNodes,
  reorderLessons,
} from './repository';
import { FSRS_VERSION } from '../fsrs/params';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseExamDates.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
  ]);
}

describe('createCourse', () => {
  beforeEach(reset);

  it('applies all required defaults', async () => {
    const before = Date.now();
    const course = await createCourse('Biology');
    const after = Date.now();

    expect(course.name).toBe('Biology');
    expect(course.description).toBe('');
    expect(course.createdAt).toBeGreaterThanOrEqual(before);
    expect(course.createdAt).toBeLessThanOrEqual(after);
    expect(course.fsrsVersion).toBe(FSRS_VERSION);
    expect(course.fsrsParameters).toBeDefined();
    expect(course.examObjective).toBe('expectedMarks');
    expect(course.unlockMode).toBe('open');
    expect(course.autoPractice).toBe(true);
    expect(course.practiceThresholdMinutesFar).toBe(60);
    expect(course.practiceThresholdMinutesNear).toBe(30);
    expect(course.practiceUrgentWindowDays).toBe(7);
    expect(course.practiceMaxGap).toBe(5);
    // examDate is 7 days ahead of createdAt at 23:59 local time.
    expect(course.examDate).toBeGreaterThan(course.createdAt);
    // id is generated.
    expect(typeof course.id).toBe('string');
    expect(course.id.length).toBeGreaterThan(0);
    // Persisted.
    expect(await db.courses.get(course.id)).toBeDefined();
  });

  it('opts override defaults', async () => {
    const course = await createCourse('Physics', { unlockMode: 'linear', autoPractice: false });
    expect(course.unlockMode).toBe('linear');
    expect(course.autoPractice).toBe(false);
  });

  it('falls back to "Untitled course" for a blank name', async () => {
    const course = await createCourse('   ');
    expect(course.name).toBe('Untitled course');
  });
});

describe('createLesson orderIndex', () => {
  beforeEach(reset);

  it('first lesson gets orderIndex 0', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.orderIndex).toBe(0);
  });

  it('subsequent lessons increment orderIndex', async () => {
    const course = await createCourse('History');
    const l1 = await createLesson(course.id, 'Week 1');
    const l2 = await createLesson(course.id, 'Week 2');
    const l3 = await createLesson(course.id, 'Week 3');
    expect(l1.orderIndex).toBe(0);
    expect(l2.orderIndex).toBe(1);
    expect(l3.orderIndex).toBe(2);
  });

  it('uses max existing orderIndex + 1 even after gaps', async () => {
    const course = await createCourse('History');
    await createLesson(course.id, 'A', { orderIndex: 10 });
    const next = await createLesson(course.id, 'B');
    expect(next.orderIndex).toBe(11);
  });

  it('defaults isExtension to false', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.isExtension).toBe(false);
  });
});

describe('deleteCourse cascade', () => {
  beforeEach(reset);

  it('removes the course, all its lessons, notes, links, practiceNodes, examDates, and its cards', async () => {
    const course = await createCourse('Cascade test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    await createNote(lesson1.id, 'Note A');
    await createNote(lesson2.id, 'Note B');

    // Create a deck and card that belongs to this course.
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await db.cards.update(card.id, { courseId: course.id });

    // Link the card to lesson1.
    await linkCardToLesson(lesson1.id, card.id);

    // Add a practice node.
    await createPracticeNode(course.id, { type: 'manual', name: 'Practice 1' });

    // Add an exam date.
    await createCourseExamDate(course.id, 'Mid-term', Date.now() + 7 * 86400000);

    // Verify rows exist.
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.notes.count()).toBe(2);
    expect(await db.lessonCards.count()).toBe(1);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.courseExamDates.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.courses.get(course.id)).toBeUndefined();
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.lessonCards.count()).toBe(0);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.courseExamDates.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(0);
  });
});

describe('deleteLesson', () => {
  beforeEach(reset);

  it('removes notes and lessonCard links belonging to the lesson', async () => {
    const course = await createCourse('Lesson delete test');
    const lesson = await createLesson(course.id, 'L1');
    await createNote(lesson.id, 'Note A');
    await createNote(lesson.id, 'Note B');

    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await linkCardToLesson(lesson.id, card.id);

    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(2);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);

    await deleteLesson(lesson.id);

    expect(await db.lessons.get(lesson.id)).toBeUndefined();
    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(0);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(0);
  });

  it('unassigns cards (sets primaryLessonId to null) rather than deleting them', async () => {
    const course = await createCourse('Lesson delete test');
    const lesson = await createLesson(course.id, 'L1');

    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    const beforeDelete = await db.cards.get(card.id);
    expect(beforeDelete?.primaryLessonId).toBe(lesson.id);

    await deleteLesson(lesson.id);

    // Card survives; primaryLessonId is cleared.
    const afterDelete = await db.cards.get(card.id);
    expect(afterDelete).toBeDefined();
    expect(afterDelete?.primaryLessonId).toBeNull();
  });
});

describe('linkCardToLesson idempotency', () => {
  beforeEach(reset);

  it('returns the existing link without creating a duplicate on a second call', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    const first = await linkCardToLesson(lesson.id, card.id);
    const second = await linkCardToLesson(lesson.id, card.id);

    expect(first.id).toBe(second.id);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);
  });

  it('creates distinct links for different cards in the same lesson', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const deck = await createDeck('Test deck');
    const c1 = await createCard(deck.id, 'front_back', 'q1', 'a1');
    const c2 = await createCard(deck.id, 'front_back', 'q2', 'a2');

    await linkCardToLesson(lesson.id, c1.id);
    await linkCardToLesson(lesson.id, c2.id);

    const links = await listLessonCardLinks(lesson.id);
    expect(links).toHaveLength(2);
  });
});

describe('reorderLessons', () => {
  beforeEach(reset);

  it('reassigns orderIndex by array position', async () => {
    const course = await createCourse('Reorder test');
    const l1 = await createLesson(course.id, 'L1'); // orderIndex 0
    const l2 = await createLesson(course.id, 'L2'); // orderIndex 1
    const l3 = await createLesson(course.id, 'L3'); // orderIndex 2

    // Reverse the order.
    await reorderLessons(course.id, [l3.id, l2.id, l1.id]);

    const updated = await listLessons(course.id);
    expect(updated[0].id).toBe(l3.id);
    expect(updated[0].orderIndex).toBe(0);
    expect(updated[1].id).toBe(l2.id);
    expect(updated[1].orderIndex).toBe(1);
    expect(updated[2].id).toBe(l1.id);
    expect(updated[2].orderIndex).toBe(2);
  });
});

describe('listNotes ordering', () => {
  beforeEach(reset);

  it('returns notes in orderIndex ascending order', async () => {
    const course = await createCourse('Notes test');
    const lesson = await createLesson(course.id, 'L1');
    const n1 = await createNote(lesson.id, 'Note 1');
    const n2 = await createNote(lesson.id, 'Note 2');
    const n3 = await createNote(lesson.id, 'Note 3');

    const notes = await listNotes(lesson.id);
    expect(notes.map((n) => n.id)).toEqual([n1.id, n2.id, n3.id]);
  });
});

describe('listCourseExamDates ordering', () => {
  beforeEach(reset);

  it('returns exam dates ordered by examDate ascending', async () => {
    const course = await createCourse('Exam dates test');
    const t1 = Date.now() + 10 * 86400000;
    const t2 = Date.now() + 30 * 86400000;
    const t3 = Date.now() + 5 * 86400000;
    const d1 = await createCourseExamDate(course.id, 'Late', t1);
    const d2 = await createCourseExamDate(course.id, 'Later', t2);
    const d3 = await createCourseExamDate(course.id, 'Soon', t3);

    const dates = await listCourseExamDates(course.id);
    expect(dates.map((d) => d.id)).toEqual([d3.id, d1.id, d2.id]);
  });
});

describe('listPracticeNodes', () => {
  beforeEach(reset);

  it('returns only nodes belonging to the given course', async () => {
    const c1 = await createCourse('Course 1');
    const c2 = await createCourse('Course 2');
    await createPracticeNode(c1.id, { type: 'auto', name: 'P1' });
    await createPracticeNode(c2.id, { type: 'manual', name: 'P2' });

    const nodes1 = await listPracticeNodes(c1.id);
    const nodes2 = await listPracticeNodes(c2.id);
    expect(nodes1).toHaveLength(1);
    expect(nodes1[0].name).toBe('P1');
    expect(nodes2).toHaveLength(1);
    expect(nodes2[0].name).toBe('P2');
  });
});

describe('createCard opts', () => {
  beforeEach(reset);

  it('stamps courseId and primaryLessonId when opts are provided', async () => {
    const deck = await createDeck('Test deck');
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'L1');

    const card = await createCard(deck.id, 'front_back', 'q', 'a', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBe(lesson.id);
  });

  it('leaves courseId and primaryLessonId undefined when opts are omitted', async () => {
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBeUndefined();
    expect(card.primaryLessonId).toBeUndefined();
  });
});

describe('ensureLessonDeck', () => {
  beforeEach(reset);

  it('creates a backing deck and userPerformance row for a new lesson', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);

    const deck = await db.decks.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Lesson 1');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.fsrsVersion).toBe(course.fsrsVersion);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.userPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing backing deck on a second call for the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);
    // Simulate a card already living in this lesson's deck, as createLessonCard would leave behind.
    await createCard(deckId, 'front_back', 'q', 'a', [], { courseId: course.id, primaryLessonId: lesson.id });

    const deckIdAgain = await ensureLessonDeck(course.id, lesson.id);

    expect(deckIdAgain).toBe(deckId);
    expect(await db.decks.count()).toBe(1);
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
    expect(await db.decks.get(card.deckId)).toBeDefined();

    const lessonCards = await db.cards.where('primaryLessonId').equals(lesson.id).toArray();
    expect(lessonCards.map((c) => c.id)).toEqual([card.id]);
  });

  it('reuses the same backing deck for a second card in the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const first = await createLessonCard(course.id, lesson.id, 'front_back', 'q1', 'a1');
    const second = await createLessonCard(course.id, lesson.id, 'front_back', 'q2', 'a2');

    expect(second.deckId).toBe(first.deckId);
    expect(await db.decks.count()).toBe(1);
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

  it('leave courseId/primaryLessonId undefined on both cards when opts are omitted', async () => {
    const deck = await createDeck('Test deck');

    const { card, reverse } = await createCardWithReverse(deck.id, 'q', 'a');
    expect(card.courseId).toBeUndefined();
    expect(reverse.courseId).toBeUndefined();

    const { card: card2, reverse: reverse2 } = await createBasicReversedPair(deck.id, 'q2', 'a2');
    expect(card2.courseId).toBeUndefined();
    expect(reverse2.courseId).toBeUndefined();
  });
});

describe('ensureCourseBankDeck', () => {
  beforeEach(reset);

  it('creates a backing deck and userPerformance row for a course with no unassigned cards yet', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });

    const deckId = await ensureCourseBankDeck(course.id);

    const deck = await db.decks.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Course — Question bank');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.userPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing bank deck on a second call, ignoring lesson-assigned cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    const deckId = await ensureCourseBankDeck(course.id);
    await createCard(deckId, 'front_back', 'q2', 'a2', [], { courseId: course.id, primaryLessonId: null });

    const deckIdAgain = await ensureCourseBankDeck(course.id);

    expect(deckIdAgain).toBe(deckId);
    // One lesson deck plus one bank deck.
    expect(await db.decks.count()).toBe(2);
  });
});

describe('createCourseCard', () => {
  beforeEach(reset);

  it('creates a card with courseId set and primaryLessonId null, backed by a real deck', async () => {
    const course = await createCourse('Course');

    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBeNull();
    expect(await db.decks.get(card.deckId)).toBeDefined();
  });

  it('reuses the same bank deck for a second unassigned card', async () => {
    const course = await createCourse('Course');

    const first = await createCourseCard(course.id, 'front_back', 'q1', 'a1');
    const second = await createCourseCard(course.id, 'front_back', 'q2', 'a2');

    expect(second.deckId).toBe(first.deckId);
    expect(await db.decks.count()).toBe(1);
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

describe('assignCardsToLesson', () => {
  beforeEach(reset);

  it('moves unassigned cards into a lesson and updates deckId to match', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    const bankDeckId = card.deckId;

    await assignCardsToLesson([card.id], course.id, lesson.id);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBe(lesson.id);
    expect(updated?.deckId).not.toBe(bankDeckId);
    expect(updated?.deckId).toBe(await ensureLessonDeck(course.id, lesson.id));
  });

  it('unassigns a lesson card back to the course bank deck when lessonId is null', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    await assignCardsToLesson([card.id], course.id, null);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBeNull();
    expect(updated?.deckId).toBe(await ensureCourseBankDeck(course.id));
  });

  it('reassigns multiple cards from different lessons to the same target lesson', async () => {
    const course = await createCourse('Course');
    const lessonA = await createLesson(course.id, 'Lesson A');
    const lessonB = await createLesson(course.id, 'Lesson B');
    const cardA = await createLessonCard(course.id, lessonA.id, 'front_back', 'qa', 'aa');
    const cardB = await createLessonCard(course.id, lessonB.id, 'front_back', 'qb', 'ab');

    await assignCardsToLesson([cardA.id, cardB.id], course.id, lessonB.id);

    const [updatedA, updatedB] = await Promise.all([
      db.cards.get(cardA.id),
      db.cards.get(cardB.id),
    ]);
    expect(updatedA?.primaryLessonId).toBe(lessonB.id);
    expect(updatedB?.primaryLessonId).toBe(lessonB.id);
    expect(updatedA?.deckId).toBe(updatedB?.deckId);
  });
});
