import type { Card, Course, Lesson } from '@lacuna/core/db/types';
import type { CourseForecast, ForecastPoint } from '../fsrs/courseForecast';
import { listAllReviewHistory } from '../db/reviewHistoryRead';
import { dashboardForecastHistories } from './dashboardForecasts';

export interface ForecastHistoryInput {
  courses: Course[];
  lessons: Lesson[];
  cards: Card[];
  forecasts: Record<string, CourseForecast>;
  from: number;
  now: number;
}

export type ForecastHistories = Record<string, ForecastPoint[]>;

export async function calculateForecastHistories(
  input: ForecastHistoryInput,
): Promise<ForecastHistories> {
  const history = await listAllReviewHistory(input.cards);
  return dashboardForecastHistories(
    input.courses,
    input.lessons,
    input.cards,
    history,
    input.forecasts,
    input.from,
    input.now,
  );
}
