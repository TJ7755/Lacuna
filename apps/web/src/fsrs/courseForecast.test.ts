import { describe, it, expect } from 'vitest';
import { courseForecast, examDayHistory } from '@lacuna/core/fsrs/courseForecast';
import { modelOf } from '@lacuna/core/fsrs/fsrs';
import { rAtExam } from '@lacuna/core/fsrs/forwardSim';
import { defaultFsrsParameters, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card, Grade, SchedulerConfig } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';

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
    stabilityFast: null,
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

const model = modelOf(defaultFsrsParameters());
const initialMemory = model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
function reviewedCard(id: string, gapDays: number, daysAgo: number): Card {
  const lastReviewed = NOW - daysAgo * MS_PER_DAY;
  return makeCard({
    id,
    ...model.step({ memoryState: initialMemory, rating: 3, elapsedDays: gapDays }),
    lastReviewed,
    reps: 3,
    state: 2,
    due: lastReviewed + gapDays * MS_PER_DAY,
    scheduledDays: Math.round(gapDays),
  });
}

function entry(
  cardId: string,
  daysAgo: number,
  gapDays: number,
  grade: Grade = 3,
): ReviewHistoryEntry {
  const memory = model.step({ memoryState: initialMemory, rating: grade, elapsedDays: gapDays });
  return {
    id: `${cardId}-${daysAgo}`,
    cardId,
    timestamp: NOW - daysAgo * MS_PER_DAY,
    grade,
    responseTimeSec: 4,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: memory.stability,
    stabilityFastAfter: memory.stabilityFast,
    difficultyBefore: null,
    difficultyAfter: memory.difficulty,
    retrievabilityAtReview: null,
  };
}

describe('courseForecast', () => {
  it('measures exam-day recall if study stopped now, counting unreviewed cards as 0', () => {
    const cards = [reviewedCard('a', 5, 2), reviewedCard('b', 12, 6), makeCard({ id: 'new' })];
    const f = courseForecast(cards, makeCourse({ examDate: NOW + 30 * MS_PER_DAY }), NOW);
    expect(f.ifStopped).toBeCloseTo(
      ((rAtExam(cards[0], f.end, NOW, model) ?? 0) + (rAtExam(cards[1], f.end, NOW, model) ?? 0)) /
        3,
      12,
    );
  });

  it('withholds the whole forecast when any learnt card has opaque legacy memory', () => {
    const opaque = reviewedCard('legacy', 5, 2);
    opaque.stabilityFast = null;
    const forecast = courseForecast(
      [reviewedCard('known', 12, 1), opaque, makeCard({ id: 'new' })],
      makeCourse({ examDate: NOW + 7 * MS_PER_DAY }),
      NOW,
    );
    expect(forecast.ifStopped).toBeNull();
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
    expect(points[9].recall).toBeCloseTo(
      courseForecast([card, makeCard({ id: 'new' })], course, NOW).ifStopped as number,
      12,
    );
  });

  it('is 0 before a card was first reviewed and rises once it was', () => {
    const card = reviewedCard('a', 5, 2);
    const history = [entry('a', 10, 2), entry('a', 2, 5)];
    const points = examDayHistory([card], history, course, end, from, NOW, 19);
    const before = points.filter((point) => point.at < NOW - 10 * MS_PER_DAY);
    const after = points.filter(
      (point) => point.at >= NOW - 10 * MS_PER_DAY && point.at < NOW - 2 * MS_PER_DAY,
    );
    expect(before.every((point) => point.recall === 0)).toBe(true);
    expect(after.every((point) => (point.recall ?? 0) > 0)).toBe(true);
  });

  it('leaves old history without a fast trace unavailable until complete recorded memory resumes', () => {
    const card = reviewedCard('a', 5, 2);
    const legacy = entry('a', 10, 2);
    delete legacy.stabilityFastAfter;
    const points = examDayHistory(
      [card],
      [entry('a', 14, 1), legacy, entry('a', 6, 6)],
      course,
      end,
      from,
      NOW,
      19,
    );
    // An earlier complete state must not be carried forward or replayed through
    // a legacy review; the card's current fast trace cannot fill this gap either.
    expect(
      points.filter((point) => point.at < NOW - 14 * MS_PER_DAY).map((point) => point.recall),
    ).toEqual([0, 0, 0, 0]);
    expect(
      points
        .filter((point) => point.at >= NOW - 14 * MS_PER_DAY && point.at < NOW - 10 * MS_PER_DAY)
        .every((point) => point.recall !== null && point.recall > 0),
    ).toBe(true);
    expect(
      points
        .filter((point) => point.at >= NOW - 10 * MS_PER_DAY && point.at < NOW - 6 * MS_PER_DAY)
        .map((point) => point.recall),
    ).toEqual([null, null, null, null]);
    expect(
      points
        .filter((point) => point.at >= NOW - 6 * MS_PER_DAY)
        .every((point) => point.recall !== null && point.recall > 0),
    ).toBe(true);
  });

  it('uses both traces each past review recorded, so a lapse lowers the figure', () => {
    const card = reviewedCard('a', 5, 1);
    const at = (grade: Grade) =>
      examDayHistory(
        [card],
        [entry('a', 12, 4), entry('a', 6, 6, grade)],
        course,
        end,
        from,
        NOW,
        19,
      ).find((point) => point.at >= NOW - 6 * MS_PER_DAY)!.recall;
    const afterLapse = at(1);
    const afterSuccess = at(3);
    expect(afterLapse).not.toBeNull();
    expect(afterSuccess).not.toBeNull();
    expect(afterLapse!).toBeLessThan(afterSuccess!);
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
