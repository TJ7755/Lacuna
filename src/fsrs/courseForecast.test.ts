import { describe, it, expect } from 'vitest';
import { courseForecast, examDayHistory } from './courseForecast';
import { rAtExam } from './forwardSim';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import type { Card, SchedulerConfig } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';

const NOW = 1_800_000_000_000;

function makeCourse(
  partial: Partial<SchedulerConfig & { examDate?: number }> = {},
): SchedulerConfig & { examDate?: number } {
  return {
    id: 'course',
    examObjective: 'expectedMarks',
    fsrsParameters: defaultFsrsParameters(),
    ...partial,
  };
}

function makeCard(partial: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    conceptId: 'concept-c1',
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
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
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

function reviewedCard(id: string, stability: number, daysAgo: number): Card {
  const lastReviewed = NOW - daysAgo * MS_PER_DAY;
  return makeCard({
    id,
    stability,
    difficulty: 5,
    lastReviewed,
    reps: 3,
    state: 2,
    due: lastReviewed + stability * MS_PER_DAY,
    scheduledDays: Math.round(stability),
  });
}

const decay = -defaultFsrsParameters().w[20];

function entry(cardId: string, daysAgo: number, stabilityAfter: number): ReviewHistoryEntry {
  return {
    id: `${cardId}-${daysAgo}`,
    cardId,
    timestamp: NOW - daysAgo * MS_PER_DAY,
    grade: 3,
    responseTimeSec: 4,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

describe('courseForecast', () => {
  it('measures exam-day recall if study stopped now, counting unreviewed cards as 0', () => {
    const cards = [reviewedCard('a', 5, 2), reviewedCard('b', 12, 6), makeCard({ id: 'new' })];
    const f = courseForecast(cards, makeCourse({ examDate: NOW + 30 * MS_PER_DAY }), NOW);
    expect(f.ifStopped).toBeCloseTo(
      (rAtExam(cards[0], f.end, NOW, decay) + rAtExam(cards[1], f.end, NOW, decay)) / 3,
      12,
    );
  });

  it('reads 0 for a course that has not been studied', () => {
    const f = courseForecast([makeCard()], makeCourse({ examDate: NOW + 7 * MS_PER_DAY }), NOW);
    expect(f.ifStopped).toBe(0);
    expect(courseForecast([], makeCourse(), NOW).ifStopped).toBe(0);
  });

  it('uses a 28-day horizon for a steady course', () => {
    const f = courseForecast([reviewedCard('a', 5, 2)], makeCourse(), NOW);
    expect(f.hasExam).toBe(false);
    expect(f.end).toBe(NOW + 28 * MS_PER_DAY);
    const past = courseForecast([reviewedCard('a', 5, 2)], makeCourse({ examDate: NOW - 1 }), NOW);
    expect(past.hasExam).toBe(false);
  });
});

describe('examDayHistory', () => {
  const course = makeCourse({ examDate: NOW + 7 * MS_PER_DAY });
  const end = NOW + 7 * MS_PER_DAY;
  const from = NOW - 18 * MS_PER_DAY;

  it('samples evenly from the window start to now and ends at the stop-now figure', () => {
    const card = reviewedCard('a', 5, 2);
    const points = examDayHistory([card, makeCard({ id: 'new' })], [], course, end, from, NOW, 10);
    expect(points).toHaveLength(10);
    expect(points[0].at).toBe(from);
    expect(points[9].at).toBe(NOW);
    expect(points[9].recall).toBeCloseTo(courseForecast([card, makeCard({ id: 'new' })], course, NOW).ifStopped, 12);
  });

  it('is 0 before a card was first reviewed and rises once it was', () => {
    const card = reviewedCard('a', 5, 2);
    const history = [entry('a', 10, 2), entry('a', 2, 5)];
    const points = examDayHistory([card], history, course, end, from, NOW, 19);
    const before = points.filter((point) => point.at < NOW - 10 * MS_PER_DAY);
    const after = points.filter((point) => point.at >= NOW - 10 * MS_PER_DAY && point.at < NOW - 2 * MS_PER_DAY);
    expect(before.every((point) => point.recall === 0)).toBe(true);
    expect(after.every((point) => point.recall > 0)).toBe(true);
  });

  it('uses the stability each past review recorded, so a lapse lowers the figure', () => {
    const card = reviewedCard('a', 5, 1);
    const at = (stability: number) =>
      examDayHistory([card], [entry('a', 12, 4), entry('a', 6, stability)], course, end, from, NOW, 19).find(
        (point) => point.at >= NOW - 6 * MS_PER_DAY,
      )!.recall;
    expect(at(0.5)).toBeLessThan(at(12));
  });

  it('traces 5,000 cards with ten reviews each quickly', () => {
    const cards = Array.from({ length: 5000 }, (_, i) => reviewedCard(`c${i}`, 10, 1));
    const history = cards.flatMap((card) =>
      Array.from({ length: 10 }, (_, k) => entry(card.id, 20 - k * 2, 2 + k)),
    );
    const t0 = performance.now();
    examDayHistory(cards, history, course, end, from, NOW);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
