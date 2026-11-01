import { addDays } from '../fsrs/heatmap';
import { startOfDay } from '../utils/datetime';

export interface WeekSummary {
  /** Review attempts in the last seven local days, including today. */
  reviewed: number;
  /** Monday to Sunday of the current week: whether anything was reviewed that day. */
  studied: boolean[];
  /** Index of today within `studied` (0 = Monday). */
  todayIndex: number;
}

function mondayIndex(ms: number): number {
  return (new Date(ms).getDay() + 6) % 7;
}

/** Summarise compact review timestamps; full review records are never needed. */
export function weekSummary(timestamps: Iterable<number>, now: number): WeekSummary {
  const today = startOfDay(now);
  const todayIndex = mondayIndex(now);
  const monday = addDays(today, -todayIndex);
  const sevenDaysAgo = addDays(today, -6);
  const studied = Array.from({ length: 7 }, () => false);
  let reviewed = 0;
  for (const timestamp of timestamps) {
    if (timestamp > now) continue;
    if (timestamp >= sevenDaysAgo) reviewed++;
    if (timestamp >= monday) {
      const index = Math.round((startOfDay(timestamp) - monday) / 86_400_000);
      if (index >= 0 && index < 7) studied[index] = true;
    }
  }
  return { reviewed, studied, todayIndex };
}
