// Lightweight, dependency-free study statistics for the dashboard: a day streak, a
// "reviewed today" count, and a seven-day workload forecast expressed in *minutes* of
// study rather than a raw card count. All three are derived from data already stored
// (review history, card due dates, per-deck response-time calibration), so they need no
// new tables. Every function is pure and works in local time.

import type { Card } from '../db/types';
import { MS_PER_DAY } from './params';
import { startOfDay } from '../utils/datetime';

/** Fallback per-review time (seconds) for a deck with no calibration yet. */
export const DEFAULT_REVIEW_SECONDS = 8;

/** Number of days shown in the forecast, starting today. */
export const FORECAST_DAYS = 7;

export interface DayForecast {
  /** Local midnight epoch for the day. */
  dayStart: number;
  /** How many cards come due that day (overdue cards fold into today). */
  dueCount: number;
  /** Estimated minutes of study, from each card's deck response-time mean. */
  minutes: number;
}

export interface StudyStats {
  /** Consecutive days (ending today, or yesterday if today is not yet studied). */
  streak: number;
  /** Reviews recorded so far today. */
  reviewedToday: number;
  /** Per-day workload for the next FORECAST_DAYS days. */
  forecast: DayForecast[];
}

/** Local midnight n days before the given local-midnight epoch (DST-safe). */
function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return startOfDay(d.getTime());
}

/**
 * Consecutive-day streak from a set of studied local-midnight days. Counts back from
 * today; if today has no reviews yet the streak still stands provided yesterday does,
 * so a morning before studying does not read as a broken streak.
 */
function streakFrom(daySet: Set<number>, today: number): number {
  let day = today;
  if (!daySet.has(day)) {
    day = addDays(today, -1);
    if (!daySet.has(day)) return 0;
  }
  let streak = 0;
  while (daySet.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

/**
 * Compute the dashboard statistics.
 *
 * @param cards         every card across all decks
 * @param deckSeconds   deckId → mean seconds per review, for decks that have calibration
 * @param now           reference instant (defaults to now)
 */
export function computeStudyStats(
  cards: Card[],
  deckSeconds: Map<string, number>,
  now: number = Date.now(),
): StudyStats {
  const today = startOfDay(now);

  // Day streak and reviews-today come from each card's append-only review history.
  const studiedDays = new Set<number>();
  let reviewedToday = 0;
  for (const card of cards) {
    for (const log of card.history) {
      const day = startOfDay(log.timestamp);
      studiedDays.add(day);
      if (day === today) reviewedToday += 1;
    }
  }

  // Seven-day forecast: bucket each card by its effective due day, folding anything
  // already due (or buried) into the correct day, and weight by the deck's mean time.
  const forecast: DayForecast[] = Array.from({ length: FORECAST_DAYS }, (_, i) => ({
    dayStart: addDays(today, i),
    dueCount: 0,
    minutes: 0,
  }));
  const lastDay = forecast[forecast.length - 1].dayStart;

  for (const card of cards) {
    if (card.suspended) continue;
    if (card.due == null) continue; // never-reviewed cards are not yet scheduled
    const effectiveDue = Math.max(card.due, card.buriedUntil ?? 0);
    // Overdue cards count today; cards beyond the window are ignored.
    const bucketDay = Math.max(startOfDay(effectiveDue), today);
    if (bucketDay > lastDay) continue;
    const index = Math.round((bucketDay - today) / MS_PER_DAY);
    const slot = forecast[index];
    if (!slot) continue;
    slot.dueCount += 1;
    slot.minutes += (deckSeconds.get(card.deckId) ?? DEFAULT_REVIEW_SECONDS) / 60;
  }

  return { streak: streakFrom(studiedDays, today), reviewedToday, forecast };
}
