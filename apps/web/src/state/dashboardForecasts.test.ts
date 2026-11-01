import { describe, expect, it } from 'vitest';
import {
  clearForecastCache,
  dashboardForecasts,
  dashboardForecastHistories,
  urgencyOrder,
} from './dashboardForecasts';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { examDayHistory } from '../fsrs/courseForecast';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';

const NOW = Date.UTC(2026, 4, 21);
const DAY = 86_400_000;

describe('urgencyOrder', () => {
  it('puts the nearest exam first and courses without one last', () => {
    const rows = [
      { id: 'french', due: 9 },
      { id: 'chemistry', examDate: NOW + 28 * DAY, due: 14 },
      { id: 'biology', examDate: NOW + 22 * DAY, due: 24 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual([
      'biology',
      'chemistry',
      'french',
    ]);
  });

  it('treats a past exam like no exam and breaks ties by the larger workload', () => {
    const rows = [
      { id: 'old', examDate: NOW - DAY, due: 2 },
      { id: 'steady', due: 5 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual(['steady', 'old']);
  });
});

describe('dashboardForecasts', () => {
  const course = {
    id: 'bio',
    name: 'Biology',
    examDate: NOW + 20 * DAY,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  } as unknown as Course;
  const card = (id: string, stability: number) =>
    ({
      id,
      courseId: 'bio',
      primaryLessonId: null,
      stability,
      difficulty: 5,
      lastReviewed: NOW - DAY,
      reps: 2,
      lapses: 0,
      state: 2,
      due: NOW + DAY,
      history: [],
    }) as unknown as Card;

  it('reuses a course forecast until its cards change', () => {
    clearForecastCache();
    const cards = [card('a', 4), card('b', 9)];
    const first = dashboardForecasts([course], [], cards, NOW).bio;
    expect(dashboardForecasts([course], [], cards, NOW + 60_000).bio).toBe(first);
    const reviewed = [card('a', 12), card('b', 9)];
    expect(dashboardForecasts([course], [], reviewed, NOW + 60_000).bio).not.toBe(first);
  });

  it('replays current card membership even when review ownership predates a move', () => {
    const chemistry = { ...course, id: 'chemistry' };
    const archived = { ...course, id: 'archived', archived: true };
    const courses = [course, chemistry, archived];
    const biologyCard = card('biology-card', 4);
    const moved = { ...card('moved', 9), courseId: chemistry.id };
    const cards = [
      biologyCard,
      moved,
      { ...card('extension', 2), primaryLessonId: 'extension' },
      { ...card('suspended', 2), suspended: true },
      { ...card('archived', 2), courseId: archived.id },
    ];
    const lessons = [{ id: 'extension', courseId: course.id, isExtension: true }] as Lesson[];
    const history = [
      'moved',
      'biology-card',
      'extension',
      'suspended',
      'archived',
      'deleted',
    ].flatMap((cardId) =>
      [2, 5].map(
        (days, i) =>
          ({
            id: `${cardId}-${i}`,
            cardId,
            courseId: 'old-course',
            timestamp: NOW - days * DAY,
            stabilityAfter: days,
          }) as ReviewHistoryEntry,
      ),
    );
    const forecasts = dashboardForecasts(courses, lessons, cards, NOW);
    const from = NOW - 8 * DAY;
    const histories = dashboardForecastHistories(
      courses,
      lessons,
      cards,
      history,
      forecasts,
      from,
      NOW,
    );
    expect(histories).toEqual({
      bio: examDayHistory([biologyCard], history, course, forecasts.bio.end, from, NOW),
      chemistry: examDayHistory([moved], history, chemistry, forecasts.chemistry.end, from, NOW),
    });
    expect(dashboardForecastHistories(courses, lessons, cards, history, {}, from, NOW)).toEqual({});
  });
});
