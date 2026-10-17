import type { CourseForecast } from '../../fsrs/courseForecast';

// Kept apart from the chart so the shell and Today's queue can read a course's status
// without loading the chart, which Today loads on demand.

export type ForecastStatus = 'ahead' | 'behind' | 'steady';

export const STATUS_COLOUR: Record<ForecastStatus, string> = {
  ahead: 'hsl(var(--positive))',
  behind: 'hsl(var(--warning))',
  steady: 'hsl(var(--ink-faint))',
};

export const STATUS_LABEL: Partial<Record<ForecastStatus, string>> = {
  ahead: 'On track',
  behind: 'Behind',
};

export function forecastStatus(forecast: CourseForecast): ForecastStatus {
  if (!forecast.hasExam) return 'steady';
  return forecast.ifStopped + 0.005 >= forecast.target ? 'ahead' : 'behind';
}
