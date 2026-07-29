import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCard, createCourse, createCourseCard, createDeck, createLesson } from './repository';
import {
  exportCardsCsv,
  exportCardsJson,
  exportCardsMarkdownTable,
  exportCardsPlainText,
  exportCardsTsv,
  exportReviewHistoryCsv,
  exportReviewHistoryJson,
} from './export';

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
  ]);
}

describe('card exporters: course/lesson naming', () => {
  beforeEach(reset);

  it('shows the legacy deck name unchanged for a deck-only card', async () => {
    const deck = await createDeck('Legacy Deck', 'blue');
    await createCard(deck.id, 'front_back', 'Q', 'A');

    const csv = await exportCardsCsv();
    expect(csv).toContain('Legacy Deck');
    expect(csv).toContain('blue');

    const tsv = await exportCardsTsv();
    expect(tsv).toContain('Legacy Deck');

    const plain = await exportCardsPlainText();
    expect(plain).toContain('Deck: Legacy Deck');

    const md = await exportCardsMarkdownTable();
    expect(md).toContain('Legacy Deck');

    const json = JSON.parse(await exportCardsJson());
    expect(json[0].deck).toBe('Legacy Deck');
  });

  it('shows "Course — Lesson" for a card assigned to a lesson', async () => {
    const course = await createCourse('Biology', { colour: 'green' });
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createCourseCard(course.id, 'front_back', 'Q', 'A');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    const csv = await exportCardsCsv();
    expect(csv).toContain('Biology — Cells');
    expect(csv).toContain('green');

    const tsv = await exportCardsTsv();
    expect(tsv).toContain('Biology — Cells');

    const plain = await exportCardsPlainText();
    expect(plain).toContain('Deck: Biology — Cells');

    const md = await exportCardsMarkdownTable();
    expect(md).toContain('Biology — Cells');

    const json = JSON.parse(await exportCardsJson());
    expect(json[0].deck).toBe('Biology — Cells');
  });

  it('shows just the course name when the card has no lesson', async () => {
    const course = await createCourse('Chemistry');
    await createCourseCard(course.id, 'front_back', 'Q', 'A');

    const csv = await exportCardsCsv();
    expect(csv).toContain('Chemistry');
    expect(csv).not.toContain('Chemistry —');

    const json = JSON.parse(await exportCardsJson());
    expect(json[0].deck).toBe('Chemistry');
  });

  it('review history exporters use the course/lesson name too', async () => {
    const course = await createCourse('Physics');
    const lesson = await createLesson(course.id, 'Mechanics');
    const card = await createCourseCard(course.id, 'front_back', 'Q', 'A');
    await db.cards.update(card.id, {
      primaryLessonId: lesson.id,
      history: [
        {
          timestamp: Date.now(),
          grade: 3,
          responseTimeSec: 5,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 1,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
      ],
    });

    const csv = await exportReviewHistoryCsv();
    expect(csv).toContain('Physics — Mechanics');

    const json = JSON.parse(await exportReviewHistoryJson());
    expect(json[0].deck).toBe('Physics — Mechanics');
  });
});
