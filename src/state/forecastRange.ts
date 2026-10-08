import { createLocalSetting, oneOf } from './localSetting';

export type ForecastRange = 'fortnight' | 'month' | 'quarter';

const DAYS: Record<ForecastRange, number> = { fortnight: 14, month: 30, quarter: 90 };

/** Today sits this far across the forecast chart: the past takes the rest of the window. */
export const FORECAST_PAST_SHARE = 0.6;

/** Whole days shown before and after today for a range. */
export function forecastWindow(range: ForecastRange): { past: number; future: number } {
  const past = Math.round(DAYS[range] * FORECAST_PAST_SHARE);
  return { past, future: DAYS[range] - past };
}

const setting = createLocalSetting<ForecastRange>({
  key: 'lacuna.forecastRange',
  event: 'lacuna:forecast-range',
  parse: oneOf(['fortnight', 'month', 'quarter'], 'month'),
});

export const useForecastRange = setting.use;
