import { useDeferredValue, useMemo } from 'react';
import { ForecastChart, forecastStatus, type ForecastLine } from '../dashboard/ForecastChart';
import { dashboardForecasts } from '../../state/dashboardForecasts';
import type { Card, Course, Lesson } from '../../db/types';

/**
 * The course's own exam-day forecast, drawn by the dashboard's chart with one line.
 * Nothing renders until the course has a forecast with some recall in it.
 */
export function CourseForecastCard({
  course,
  lessons,
  cards,
  multiplier,
}: {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  multiplier: number;
}) {
  // The forecast simulates every card forward, so it trails the live data.
  const input = useDeferredValue({ lessons, cards });
  const line = useMemo<ForecastLine | null>(() => {
    const now = Date.now();
    const forecast = dashboardForecasts([course], input.lessons, input.cards, now)[course.id];
    if (!forecast || !forecast.outlook.some((point) => point.recall > 0)) return null;
    return { id: course.id, name: course.name, status: forecastStatus(forecast), forecast };
  }, [course, input]);

  if (!line) return null;
  return (
    <section
      aria-label="Exam-day forecast"
      className="rounded-[28px] bg-surface px-6 pb-6 pt-7 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:px-8 md:pt-8"
    >
      <ForecastChart lines={[line]} now={Date.now()} multiplier={multiplier} />
    </section>
  );
}
