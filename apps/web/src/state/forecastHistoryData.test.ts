import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard, createLesson } from '../db/repository';
import { listAllReviewHistory } from '../db/reviewHistoryRead';
import { reviewHistoryEntryForCard } from '@lacuna/core/db/reviewHistory';
import type { ReviewLog } from '@lacuna/core/db/types';
import { dashboardForecastHistories, dashboardForecasts } from './dashboardForecasts';
import { calculateForecastHistories } from './forecastHistoryData';
import { forecastHistorySnapshot } from './forecastHistoryWorker';

const NOW = Date.UTC(2026, 10, 6, 12);
const DAY = 86_400_000;
const review = (timestamp: number, stabilityAfter: number, eventId?: string): ReviewLog => ({
  timestamp,
  stabilityAfter,
  eventId,
  grade: 3,
  responseTimeSec: 2,
  distracted: false,
  stabilityBefore: null,
  difficultyBefore: null,
  difficultyAfter: 5,
  retrievabilityAtReview: null,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('returns the exact existing traces with moved cards, legacy evidence, resets and excluded cards', async () => {
  const course = await createCourse('Biology');
  const other = await createCourse('Chemistry');
  const extension = { ...(await createLesson(course.id, 'Extension')), isExtension: true };
  const template = await createCourseCard(course.id, 'front_back', 'Image'.repeat(10000), 'Answer');
  const legacy = review(NOW - 100 * DAY, 8);
  const cards = [
    { ...template, id: 'moved', courseId: other.id, stability: 12, lastReviewed: NOW - DAY },
    {
      ...template,
      id: 'legacy',
      history: [legacy, legacy, review(NOW - 2 * DAY, 99, 'canonical')],
    },
    { ...template, id: 'reset', stability: null, lastReviewed: null },
    { ...template, id: 'extension', primaryLessonId: extension.id },
    { ...template, id: 'suspended', suspended: true },
    { ...template, id: 'buried', buriedUntil: NOW + DAY },
  ];
  await db.cards.bulkPut(cards);
  await db.cards.delete(template.id);
  await db.reviewHistory.bulkPut(
    cards.flatMap((card) => [
      {
        ...reviewHistoryEntryForCard(card, review(NOW - 100 * DAY, 3, `${card.id}-older`)),
        courseId: 'old-owner',
      },
      reviewHistoryEntryForCard(
        card,
        review(NOW - 2 * DAY, 4, card.id === 'legacy' ? 'canonical' : `${card.id}-latest`),
      ),
    ]),
  );
  const courses = [course, other];
  const lessons = [extension];
  const input = {
    courses,
    lessons,
    cards,
    forecasts: dashboardForecasts(courses, lessons, cards, NOW),
    from: NOW - 18 * DAY,
    now: NOW,
  };
  const expected = dashboardForecastHistories(
    courses,
    lessons,
    cards,
    await listAllReviewHistory(),
    input.forecasts,
    input.from,
    NOW,
  );
  const snapshot = forecastHistorySnapshot(input);
  expect(snapshot.cards[0]).toMatchObject({ front: '', back: '' });
  expect(snapshot.cards[0]).not.toHaveProperty('payload');
  expect(snapshot.cards[1].history).toEqual(cards[1].history);
  expect(cards[0].front).toBe(template.front);
  expect(await calculateForecastHistories(structuredClone(snapshot))).toEqual(expected);
  expect(Object.values(expected).every((points) => points.length === 40)).toBe(true);
});
