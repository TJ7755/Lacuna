import { useDeferredValue, useMemo } from 'react';
import { ForecastChart, forecastStatus, type ForecastLine } from '../dashboard/ForecastChart';
import { dashboardForecastHistories, dashboardForecasts } from '../../state/dashboardForecasts';
import { forecastWindow, useForecastRange } from '../../state/forecastRange';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';
import type { Card, Course, Lesson } from '../../db/types';

/**
 * The course's own exam-day forecast, drawn by the dashboard's chart with one line.
 * Nothing renders for a course without cards.
 */
export function CourseForecastCard({
  course,
  lessons,
  cards,
  history,
  multiplier,
}: {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  history: ReviewHistoryEntry[];
  multiplier: number;
}) {
  const [range] = useForecastRange();
  const chartWindow = forecastWindow(range);
  // The history replays every card's reviews, so it trails the live data.
  const input = useDeferredValue({ lessons, cards, history });
  const line = useMemo<ForecastLine | null>(() => {
    const now = Date.now();
    const forecasts = dashboardForecasts([course], input.lessons, input.cards, now);
    const forecast = forecasts[course.id];
    const points = dashboardForecastHistories(
      [course],
      input.lessons,
      input.cards,
      input.history,
      forecasts,
      now - chartWindow.past * 86_400_000,
      now,
    )[course.id];
    if (!forecast || !points) return null;
    return { id: course.id, name: course.name, status: forecastStatus(forecast), forecast, history: points };
  }, [course, input, chartWindow.past]);

  if (!line) return null;
  return (
    <section
      aria-label="Exam-day forecast"
      className="rounded-[28px] bg-surface px-6 pb-6 pt-7 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:px-8 md:pt-8"
    >
      <ForecastChart
        lines={[line]}
        now={Date.now()}
        past={chartWindow.past}
        future={chartWindow.future}
        multiplier={multiplier}
      />
    </section>
  );
}
