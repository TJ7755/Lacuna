import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCard, createCourseCard, createCourse, createLesson } from './repository';
import {
  exportCardsCsv,
  exportCardsJson,
  exportCardsMarkdownTable,
  exportCardsPlainText,
  exportCardsTsv,
  exportCardsSimple,
  exportReviewHistoryCsv,
  exportReviewHistoryJson,
} from './export';
import { parseImport } from './import';
import { parseImportAuto } from './importEngine';
import { reviewHistoryEntryForCard } from './reviewHistory';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.reviewHistory.clear(),
  ]);
}

describe('card exporters: course/lesson naming', () => {
  beforeEach(reset);

  it('shows the legacy deck name unchanged for a deck-only card', async () => {
    const deck = await createCourse('Legacy Deck', { colour: 'blue' });
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
    const review = {
      timestamp: Date.now(),
      grade: 3 as const,
      responseTimeSec: 5,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    const reviewedCard = { ...card, primaryLessonId: lesson.id, history: [review] };
    await db.cards.update(card.id, { primaryLessonId: lesson.id });
    await db.reviewHistory.put(reviewHistoryEntryForCard(reviewedCard, review));

    const csv = await exportReviewHistoryCsv();
    expect(csv).toContain('Physics — Mechanics');

    const json = JSON.parse(await exportReviewHistoryJson());
    expect(json[0].deck).toBe('Physics — Mechanics');
  });

  it('review history exporters include the complete non-secret event contract', async () => {
    const deck = await createCourse('Biology');
    const card = await createCard(deck.id, 'front_back', 'Q', 'A');
    const review = {
      eventId: 'event-1',
      sessionId: 'session-1',
      sessionKind: 'revision-plan' as const,
      revisionPlanId: 'plan-1',
      revisionWindowId: 'window-1',
      timestamp: 1_725_123_456_789,
      grade: 2 as const,
      correct: false,
      responseTimeSec: 1.25,
      distracted: true,
      hintUsed: true,
      stabilityBefore: 1,
      stabilityAfter: 2,
      difficultyBefore: 5,
      difficultyAfter: 5.5,
      retrievabilityAtReview: 0.75,
      fsrsWeightsFingerprint: 'w1:3f2a91c4',
    };
    await db.reviewHistory.put(reviewHistoryEntryForCard({ ...card, history: [review] }, review));

    const csv = await exportReviewHistoryCsv();
    expect(csv).toContain(
      'timestamp,event_id,session_id,session_kind,revision_plan_id,revision_window_id',
    );
    expect(csv).toContain('retrievability_at_review,fsrs_weights_fingerprint');
    expect(csv).toContain(
      '1725123456789,event-1,session-1,revision-plan,plan-1,window-1',
    );
    expect(csv).toContain('0.75,w1:3f2a91c4');

    const [json] = JSON.parse(await exportReviewHistoryJson());
    expect(json).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        sessionId: 'session-1',
        sessionKind: 'revision-plan',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        timestamp: 1_725_123_456_789,
        grade: 2,
        gradeLabel: 'Hard',
        correct: false,
        responseTimeSec: 1.25,
        distracted: true,
        hintUsed: true,
        fsrsWeightsFingerprint: 'w1:3f2a91c4',
      }),
    );
  });
});


describe('export field escaping', () => {
  beforeEach(reset);

  it('round-trips quotation marks through the simple TSV exporter', () => {
    const cards = [
      { front: '"quoted question"', back: '"quoted answer"' },
      { front: 'A "quote" inside', back: 'B "quote" inside' },
      { front: 'Next question', back: 'Next answer' },
    ];
    const parsed = parseImport(exportCardsSimple(cards));
    expect(parsed.skipped).toBe(0);
    expect(parsed.cards).toEqual(cards.map((card) => ({ type: 'front_back', ...card })));
  });

  it.each(['\r', '\r\n', '\n'])(
    'keeps %j line endings inside a Markdown table row',
    async (newline) => {
      const course = await createCourse('Export');
      await createCourseCard(
        course.id,
        'front_back',
        `First${newline}second`,
        `Third${newline}fourth`,
      );
      const markdown = await exportCardsMarkdownTable();
      expect(markdown.split('\n')).toHaveLength(3);
      expect(markdown).not.toContain('\r');
      expect(markdown).toContain('| First second | Third fourth |');
    },
  );
});


describe('full Card export re-import', () => {
  beforeEach(reset);

  it.each(['csv', 'tsv'] as const)(
    're-imports %s content instead of deck names and header rows',
    async (format) => {
      const course = await createCourse('Biology', { colour: 'green' });
      await createCourseCard(course.id, 'front_back', 'What, exactly?', '"Answer"\ncontinued', [
        'two words',
        'science',
      ]);
      await createCourseCard(course.id, 'cloze', 'Water is {{c1::H2O}}', '', ['chemistry']);
      const text = format === 'csv' ? await exportCardsCsv() : await exportCardsTsv();
      const result = parseImportAuto(text, { format });
      result.cards.sort((left, right) => left.front.localeCompare(right.front));
      expect(result).toEqual({
        cards: [
          { type: 'cloze', front: 'Water is {{c1::H2O}}', back: '', tags: ['chemistry'] },
          {
            type: 'front_back',
            front: 'What, exactly?',
            back: '"Answer"\ncontinued',
            tags: ['two words', 'science'],
          },
        ],
        skipped: 0,
      });
    },
  );
});
