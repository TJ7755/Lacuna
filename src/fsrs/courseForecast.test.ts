import { describe, it, expect } from 'vitest';
import { courseForecast } from './courseForecast';
import { forgettingCurve, rAtExam } from './forwardSim';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import type { Card, SchedulerConfig } from '../db/types';

const NOW = 1_800_000_000_000;

function makeCourse(
  partial: Partial<SchedulerConfig & { examDate?: number; newCardsPerDay?: number }> = {},
): SchedulerConfig & { examDate?: number; newCardsPerDay?: number } {
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

describe('courseForecast', () => {
  it('returns the requested number of samples, evenly spaced, with matching endpoints', () => {
    const exam = NOW + 40 * MS_PER_DAY;
    const cards = [reviewedCard('a', 5, 2), reviewedCard('b', 12, 6)];
    const f = courseForecast(cards, makeCourse({ examDate: exam }), NOW, { samples: 10 });
    expect(f.series).toHaveLength(10);
    expect(f.series[0].at).toBe(NOW);
    expect(f.series[9].at).toBe(exam);
    expect(f.series[0].recall).toBe(f.current);
    expect(f.series[9].recall).toBe(f.atEnd);
    const gap = f.series[1].at - f.series[0].at;
    for (let i = 2; i < f.series.length; i++) {
      expect(f.series[i].at - f.series[i - 1].at).toBeCloseTo(gap, 3);
    }
    expect(f.hasExam).toBe(true);
    expect(f.end).toBe(exam);
  });

  it('defaults to 24 samples and clamps the target', () => {
    const params = defaultFsrsParameters();
    params.requestRetention = 0.99;
    const f = courseForecast(
      [reviewedCard('a', 5, 2)],
      makeCourse({ examDate: NOW + 10 * MS_PER_DAY, fsrsParameters: params }),
      NOW,
    );
    expect(f.series).toHaveLength(24);
    expect(f.target).toBeCloseTo(0.97, 12);
  });

  it('keeping to the schedule beats stopping for reviewed cards ahead of an exam', () => {
    const exam = NOW + 60 * MS_PER_DAY;
    const cards = Array.from({ length: 20 }, (_, i) => reviewedCard(`c${i}`, 3 + i, 1 + (i % 5)));
    const f = courseForecast(cards, makeCourse({ examDate: exam }), NOW);
    expect(f.ifStopped).toBeLessThanOrEqual(f.atEnd);
    expect(f.atEnd).toBeGreaterThan(f.ifStopped);
    expect(f.atEnd).toBeGreaterThan(0.8);
  });

  it('current equals the mean retrievability now', () => {
    const cards = [reviewedCard('a', 5, 2), reviewedCard('b', 12, 6), makeCard({ id: 'new' })];
    const f = courseForecast(cards, makeCourse({ examDate: NOW + 30 * MS_PER_DAY }), NOW);
    const expected =
      (forgettingCurve(2, 5, decay) + forgettingCurve(6, 12, decay) + 0) / 3;
    expect(f.current).toBeCloseTo(expected, 12);
    expect(f.ifStopped).toBeCloseTo(
      (rAtExam(cards[0], f.end, NOW, decay) + rAtExam(cards[1], f.end, NOW, decay)) / 3,
      12,
    );
  });

  it('uses a 28-day horizon for a steady course', () => {
    const f = courseForecast([reviewedCard('a', 5, 2)], makeCourse(), NOW);
    expect(f.hasExam).toBe(false);
    expect(f.end).toBe(NOW + 28 * MS_PER_DAY);
    const past = courseForecast([reviewedCard('a', 5, 2)], makeCourse({ examDate: NOW - 1 }), NOW);
    expect(past.hasExam).toBe(false);
    expect(past.end).toBe(NOW + 28 * MS_PER_DAY);
  });

  it('starts an unreviewed-only course at 0 and rises as cards are introduced', () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard({ id: `n${i}` }));
    const f = courseForecast(cards, makeCourse({ examDate: NOW + 20 * MS_PER_DAY, newCardsPerDay: 5 }), NOW, {
      samples: 21,
    });
    expect(f.current).toBe(0);
    expect(f.series[0].recall).toBe(0);
    expect(f.series[1].recall).toBeGreaterThan(0);
    expect(f.series[1].recall).toBeLessThan(f.series[8].recall);
    expect(f.atEnd).toBeGreaterThan(0.8);
  });

  it('reviews an overdue card at now', () => {
    const card = reviewedCard('late', 2, 30);
    const f = courseForecast([card], makeCourse({ examDate: NOW + 10 * MS_PER_DAY }), NOW, { samples: 11 });
    expect(f.current).toBeLessThan(0.8);
    // One day on, a card reviewed at `now` is back near full recall.
    expect(f.series[1].recall).toBeGreaterThan(0.9);
    expect(f.series[1].recall).toBeGreaterThan(f.current);
  });

  it('returns zeros with a valid series for empty input', () => {
    const f = courseForecast([], makeCourse({ examDate: NOW + 10 * MS_PER_DAY }), NOW, { samples: 5 });
    expect(f.current).toBe(0);
    expect(f.ifStopped).toBe(0);
    expect(f.atEnd).toBe(0);
    expect(f.series).toHaveLength(5);
    expect(f.series.every((p) => p.recall === 0)).toBe(true);
  });

  it('handles 5,000 cards across 24 samples quickly', () => {
    const cards = Array.from({ length: 5000 }, (_, i) =>
      i % 5 === 0 ? makeCard({ id: `n${i}` }) : reviewedCard(`c${i}`, 1 + (i % 40), i % 20),
    );
    const t0 = performance.now();
    const f = courseForecast(cards, makeCourse({ examDate: NOW + 90 * MS_PER_DAY, newCardsPerDay: 20 }), NOW);
    const elapsed = performance.now() - t0;
    expect(f.series).toHaveLength(24);
    expect(elapsed).toBeLessThan(2000);
  });
});
