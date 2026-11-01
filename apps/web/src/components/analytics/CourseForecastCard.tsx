import { useDeferredValue, useMemo } from 'react';
import { SECTION_CARD_SURFACE_CLASS } from '../ui/SectionCard';
import { ForecastChart, type ForecastLine } from '../dashboard/ForecastChart';
import { forecastStatus } from '../dashboard/forecastStatus';
import { dashboardForecastHistories, dashboardForecasts } from '../../state/dashboardForecasts';
import { forecastWindow, useForecastRange } from '../../state/forecastRange';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';

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
    return {
      id: course.id,
      name: course.name,
      status: forecastStatus(forecast),
      forecast,
      history: points,
    };
  }, [course, input, chartWindow.past]);

  if (!line) return null;
  return (
    <section aria-label="Exam-day forecast" className={`${SECTION_CARD_SURFACE_CLASS} p-5 md:p-6`}>
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
