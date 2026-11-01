import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { reviewHistoryEntryForCard } from '../db/reviewHistory';
import { searchCardsInScope } from '../db/search';
import { db } from '../db/schema';
import type { SearchData } from './useSearchData';
import { useSearchData } from './useSearchData';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (query: () => unknown) => query(),
}));

beforeEach(async () => {
  await Promise.all([
    db.cards.clear(),
    db.courses.clear(),
    db.courseAssessments.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.questions.clear(),
    db.reviewHistory.clear(),
  ]);
});

describe('useSearchData', () => {
  it('loads searchable card projections without reading review history', async () => {
    const course = await createCourse('Biology');
    const card = await createCourseCard(course.id, 'front_back', 'Cell membrane', 'Phospholipid');
    await db.cards.update(card.id, { lapses: 8, tags: ['cells'] });
    await db.reviewHistory.put(
      reviewHistoryEntryForCard(card, {
        timestamp: Date.now(),
        grade: 1,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: 1,
        stabilityAfter: 0.5,
        difficultyBefore: 5,
        difficultyAfter: 6,
        retrievabilityAtReview: 0.8,
      }),
    );

    const reviewHistoryRead = vi.spyOn(db.reviewHistory, 'where').mockImplementation(() => {
      throw new Error('Search read review history');
    });

    try {
      const data = await (useSearchData() as unknown as Promise<SearchData>);

      expect(data.cards).toHaveLength(1);
      expect(data.cards[0]).toMatchObject({
        id: card.id,
        front: 'Cell membrane',
        lapses: 8,
        tags: ['cells'],
        history: [],
      });
      expect(
        searchCardsInScope('cell tag:cells is:leech', data, { parseQuery: true }).map(
          (result) => result.card.id,
        ),
      ).toEqual([card.id]);
    } finally {
      reviewHistoryRead.mockRestore();
    }
  });
});
