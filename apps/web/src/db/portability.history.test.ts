import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup } from './portability';
import { createCourse, createCard, recordReview } from './repository';
import { reviewHistoryEntryIdForEvent } from '@lacuna/core/db/reviewHistory';
import { hydrateCardsWithHistory } from './reviewHistoryRead';

import { reset, waitForSessionHistory } from './portability.testFixtures';

describe('backup history', () => {
  beforeEach(reset);

  it('round-trips complete review provenance through export and import', async () => {
    const deck = await createCourse('Biology');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    await recordReview({
      card,
      eventId: 'event-portability',
      sessionId: 'session-portability',
      sessionKind: 'deck',
      revisionPlanId: 'plan-1',
      revisionWindowId: 'window-1',
      deck,
      grade: 3,
      responseTimeSec: 4,
      distracted: false,
      hintUsed: true,
      correct: true,
      checkerDisputes: [
        {
          reportedAt: 1_725_123_456_789,
          question: 'Q1',
          studentLine: 'A1',
          verdict: { correct: true, marksEarned: 1 },
          checkerSeeds: [],
        },
      ],
    });

    await waitForSessionHistory('event-portability');
    const backup = await exportDatabase();
    expect(backup.reviewHistory).toEqual([
      expect.objectContaining({ id: reviewHistoryEntryIdForEvent('event-portability') }),
    ]);
    expect(backup.cards[0].history).toEqual([]);
    expect(backup.reviewHistory![0]).toEqual(
      expect.objectContaining({
        eventId: 'event-portability',
        sessionId: 'session-portability',
        sessionKind: 'deck',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        correct: true,
        hintUsed: true,
        checkerDisputes: [
          {
            reportedAt: 1_725_123_456_789,
            question: 'Q1',
            studentLine: 'A1',
            verdict: { correct: true, marksEarned: 1 },
            checkerSeeds: [],
          },
        ],
      }),
    );
    expect(backup.sessionHistory[0]).toEqual(
      expect.objectContaining({
        eventId: 'event-portability',
        sessionId: 'session-portability',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
      }),
    );

    await db.cards.clear();
    await db.schedulingUnits.clear();
    await importBackup(backup, 'replace');

    const restored = await db.cards.toArray();
    expect(restored[0].history).toEqual([]);
    const hydrated = (await hydrateCardsWithHistory(restored))[0];
    expect(hydrated.history[0]).toMatchObject({
      eventId: 'event-portability',
      revisionPlanId: 'plan-1',
      revisionWindowId: 'window-1',
    });
    expect(
      await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-portability')),
    ).toBeDefined();
  });

  it.each(['replace', 'merge'] as const)(
    'round-trips one review event exactly once in %s mode',
    async (mode) => {
      const deck = await createCourse('Review history portability');
      const card = await createCard(deck.id, 'front_back', 'Q', 'A');
      await recordReview({
        card,
        eventId: 'event-portability-consistency',
        sessionId: 'session-portability-consistency',
        sessionKind: 'deck',
        deck,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
        now: 1_725_123_456_789,
      });

      const backup = await exportDatabase();
      const exportedCard = backup.cards.find((candidate) => candidate.id === card.id)!;
      const exportedEvent = backup.reviewHistory!.find(
        (entry) => entry.eventId === 'event-portability-consistency',
      )!;
      await Promise.all([
        db.cards.clear(),
        db.schedulingUnits.clear(),
        db.reviewHistory.clear(),
        db.sessionHistory.clear(),
        db.userPerformance.clear(),
      ]);

      let localCardId: string | undefined;
      if (mode === 'merge') {
        const localDeck = await createCourse('Local merge data');
        const localCard = await createCard(localDeck.id, 'front_back', 'Local Q', 'Local A');
        await recordReview({
          card: localCard,
          eventId: 'event-local-merge-data',
          sessionId: 'session-local-merge-data',
          sessionKind: 'deck',
          deck: localDeck,
          grade: 3,
          responseTimeSec: 1,
          distracted: false,
          correct: true,
          now: 1_725_123_456_788,
        });
        localCardId = localCard.id;
      }

      await importBackup(backup, mode);
      if (mode === 'merge') {
        expect(await db.cards.get(localCardId!)).toBeDefined();
        expect(
          (await db.reviewHistory.toArray()).filter(
            (entry) => entry.eventId === 'event-local-merge-data',
          ).length,
        ).toBe(1);
        await importBackup(backup, mode);
      }

      const restoredCard = (await db.cards.get(card.id))!;
      const restoredEvents = await db.reviewHistory.where('cardId').equals(card.id).toArray();
      const hydrated = (await hydrateCardsWithHistory([restoredCard]))[0];
      expect(exportedCard.history).toEqual([]);
      expect(restoredCard.history).toEqual([]);
      expect(restoredEvents).toHaveLength(1);
      expect(restoredEvents[0]).toMatchObject({
        ...exportedEvent,
        schedulingUnitId: card.deckId,
      });
      const {
        id: _eventId,
        cardId: _eventCardId,
        deckId: _eventDeckId,
        courseId: _eventCourseId,
        primaryLessonId: _eventLessonId,
        schedulingUnitId: _eventSchedulingUnitId,
        ...exportedEventContent
      } = exportedEvent;
      expect(hydrated.history[0]).toMatchObject(exportedEventContent);
      expect(hydrated.history).toHaveLength(1);
    },
  );

  it('keeps same-event reviews from different cards when merging', async () => {
    const deck = await createCourse('MergeDeck');
    const first = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const second = await createCard(deck.id, 'front_back', 'Q2', 'A2');
    const base = await exportDatabase();
    const event = {
      eventId: 'same-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    await importBackup(
      {
        ...base,
        cards: [
          { ...first, history: [event] },
          { ...second, history: [{ ...event, timestamp: 2000 }] },
        ],
      },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'same-event'),
    ).toHaveLength(2);
  });

  it('preserves same-event rows across separate backup merges', async () => {
    const deck = await createCourse('MergeDeck');
    const first = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const second = await createCard(deck.id, 'front_back', 'Q2', 'A2');
    const base = await exportDatabase();
    const firstReview = {
      eventId: 'cross-backup-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };

    await importBackup({ ...base, cards: [{ ...first, history: [firstReview] }] }, 'merge');
    await importBackup(
      { ...base, cards: [{ ...second, history: [{ ...firstReview, timestamp: 2000 }] }] },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'cross-backup-event'),
    ).toHaveLength(2);
  });

  it('preserves distinct duplicate event rows on one card', async () => {
    const deck = await createCourse('MergeDeck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const review = {
      eventId: 'duplicate-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };

    await importBackup(
      { ...backup, cards: [{ ...card, history: [review, { ...review, timestamp: 2000 }] }] },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'duplicate-event'),
    ).toHaveLength(2);
  });

  it('appends non-duplicate session history in merge mode', async () => {
    const deck = await createCourse('HistoryDeck');
    const backup = await exportDatabase();

    await db.sessionHistory.add({
      timestamp: 1000,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      averagePredictedRetrievability: 0.5,
    });

    const backupWithHistory = {
      ...backup,
      sessionHistory: [
        { timestamp: 1000, deckId: deck.id, averagePredictedRetrievability: 0.6 },
        { timestamp: 2000, deckId: deck.id, averagePredictedRetrievability: 0.7 },
      ],
    };

    await importBackup(backupWithHistory, 'merge');

    const history = await db.sessionHistory.toArray();
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.timestamp).sort()).toEqual([1000, 2000]);
  });

  it('deduplicates replayed event ids within and across merged backups', async () => {
    const deck = await createCourse('HistoryDeck');
    const backup = await exportDatabase();
    const event = {
      eventId: 'event-merge',
      sessionId: 'session-merge',
      timestamp: 1000,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      averagePredictedRetrievability: 0.5,
    };
    const duplicate = {
      ...event,
      timestamp: 2000,
      averagePredictedRetrievability: 0.9,
    };

    await importBackup({ ...backup, sessionHistory: [event, duplicate] }, 'merge');
    await importBackup({ ...backup, sessionHistory: [duplicate] }, 'merge');

    expect(await db.sessionHistory.toArray()).toEqual([expect.objectContaining(event)]);
  });
});
