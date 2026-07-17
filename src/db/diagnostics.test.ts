import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCard, createDeck, recordReview } from './repository';
import {
  buildDiagnostics,
  formatDiagnostics,
  gatherContentSample,
  gatherCounts,
} from './diagnostics';

describe('buildDiagnostics', () => {
  it('assembles a well-formed bundle with no card content by default', () => {
    const bundle = buildDiagnostics({
      location: 'the Learn session',
      error: { name: 'TypeError', message: 'boom', stack: 'at x\nat y' },
      componentStack: 'in LearnMode',
      counts: { decks: 2, cards: 30, reviews: 100, backups: 3 },
      userAgent: 'TestAgent/1.0',
      language: 'en-GB',
      platform: 'TestOS',
      now: 1000,
    });

    expect(bundle.app).toBe('lacuna');
    expect(bundle.location).toBe('the Learn session');
    expect(bundle.error).toEqual({ name: 'TypeError', message: 'boom', stack: 'at x\nat y' });
    expect(bundle.componentStack).toBe('in LearnMode');
    expect(bundle.data.decks).toBe(2);
    expect(bundle.data.cards).toBe(30);
    expect(bundle.data.reviews).toBe(100);
    expect(bundle.data.backups).toBe(3);
    expect(bundle.environment.userAgent).toBe('TestAgent/1.0');
    // No content unless explicitly opted in.
    expect(bundle.contentSample).toBeUndefined();
  });

  it('includes course counts when supplied', () => {
    const bundle = buildDiagnostics({
      location: 'the Learn session',
      error: { message: 'boom' },
      counts: {
        decks: 0,
        cards: 0,
        reviews: 0,
        backups: 0,
        courses: 2,
        lessons: 5,
        notes: 10,
        lessonCards: 3,
        practiceNodes: 1,
        courseAssessments: 4,
        revisionPlans: 2,
      },
    });
    expect(bundle.data.courses).toBe(2);
    expect(bundle.data.lessons).toBe(5);
    expect(bundle.data.notes).toBe(10);
    expect(bundle.data.lessonCards).toBe(3);
    expect(bundle.data.practiceNodes).toBe(1);
    expect(bundle.data.courseAssessments).toBe(4);
    expect(bundle.data.revisionPlans).toBe(2);
  });

  it('includes a content sample only when one is supplied', () => {
    const bundle = buildDiagnostics({
      location: 'this page',
      error: { message: 'oops' },
      counts: { decks: 1, cards: 1, reviews: 0, backups: 0 },
      contentSample: [{ front: 'Q', back: 'A' }],
    });
    expect(bundle.contentSample).toEqual([{ front: 'Q', back: 'A' }]);
    expect(bundle.error.name).toBe('Error'); // defaulted
  });

  it('formats a bundle as readable text', () => {
    const text = formatDiagnostics(
      buildDiagnostics({
        location: 'the application',
        error: { name: 'Error', message: 'kaput', stack: null },
        counts: { decks: 0, cards: 0, reviews: 0, backups: 0 },
        now: 0,
      }),
    );
    expect(text).toContain('Lacuna diagnostic bundle');
    expect(text).toContain('Error: Error: kaput');
    expect(text).toContain('0 decks, 0 cards, 0 reviews, 0 restore points');
  });

  it('formats course counts in the bundle text when present', () => {
    const text = formatDiagnostics(
      buildDiagnostics({
        location: 'the application',
        error: { name: 'Error', message: 'kaput', stack: null },
        counts: {
          decks: 1,
          cards: 5,
          reviews: 10,
          backups: 2,
          courses: 3,
          lessons: 6,
          notes: 9,
          lessonCards: 2,
          practiceNodes: 1,
          courseAssessments: 4,
          revisionPlans: 2,
        },
        now: 0,
      }),
    );
    expect(text).toContain('3 courses');
    expect(text).toContain('6 lessons');
    expect(text).toContain('9 notes');
    expect(text).toContain('2 revision plans');
  });
});

describe('gatherCounts', () => {
  beforeEach(async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.courses.clear(),
      db.lessons.clear(),
      db.notes.clear(),
      db.lessonCards.clear(),
      db.practiceNodes.clear(),
      db.courseAssessments.clear(),
      db.revisionPlans.clear(),
    ]);
  });

  it('reports real counts including total reviews', async () => {
    const deck = await createDeck('Deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await recordReview({
      card,
      eventId: 'event-diagnostics',
      sessionId: 'session-diagnostics',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    const counts = await gatherCounts();
    expect(counts.decks).toBe(1);
    expect(counts.cards).toBe(1);
    expect(counts.reviews).toBe(1);
    expect(counts.courses).toBe(0);
    expect(counts.lessons).toBe(0);
    expect(counts.revisionPlans).toBe(0);

    const sample = await gatherContentSample(5);
    expect(sample).toEqual([{ front: 'q', back: 'a' }]);
  });
});
