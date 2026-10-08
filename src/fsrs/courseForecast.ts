// Course recall forecast (pure; no Dexie, no React).
//
// Answers "if I stopped studying now, how much would I recall on exam day?" for the
// dashboard, and how that answer has moved over recent days. No future reviews are
// assumed: a forecast that presumes every card is reviewed on time, and answered
// Good, flatters a course that has barely been started.
//
//  - an unreviewed card contributes 0 recall;
//  - a course without a future exam is measured `steadyDays` ahead instead.

import type { Card, SchedulerConfig } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { forgettingCurve, rAtExam } from './forwardSim';
import { MS_PER_DAY, clampRequestRetention } from './params';

export interface ForecastPoint {
  /** Epoch ms. */
  at: number;
  /** Mean exam-day retrievability across the course's cards, 0..1. */
  recall: number;
}

export interface CourseForecast {
  end: number;
  hasExam: boolean;
  target: number;
  /** Mean recall at `end` if no further reviews happen. */
  ifStopped: number;
}

type ForecastCourse = SchedulerConfig & { examDate?: number };

export function courseForecast(
  cards: readonly Card[],
  course: ForecastCourse,
  now: number,
  steadyDays = 28,
): CourseForecast {
  const hasExam = course.examDate !== undefined && course.examDate > now;
  const end = hasExam ? (course.examDate as number) : now + steadyDays * MS_PER_DAY;
  const decay = -course.fsrsParameters.w[20];
  let sum = 0;
  for (const card of cards) sum += rAtExam(card, end, now, decay);
  return {
    end,
    hasExam,
    target: clampRequestRetention(course.fsrsParameters.requestRetention),
    ifStopped: cards.length === 0 ? 0 : sum / cards.length,
  };
}

/**
 * The stop-now figure as it stood at each of `samples` instants from `from` to `now`.
 * A card's memory on a past day is the stability its latest review by then recorded;
 * from its latest stored review onwards the card's own state is used, so the last
 * point equals `courseForecast(...).ifStopped` even for history that predates it.
 */
export function examDayHistory(
  cards: readonly Card[],
  history: readonly ReviewHistoryEntry[],
  course: ForecastCourse,
  end: number,
  from: number,
  now: number,
  samples = 40,
): ForecastPoint[] {
  const count = Math.max(2, Math.floor(samples));
  const times = Array.from({ length: count }, (_, k) => from + ((now - from) * k) / (count - 1));
  const sums = new Array<number>(count).fill(0);
  const decay = -course.fsrsParameters.w[20];

  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of history) {
    const list = byCard.get(entry.cardId);
    if (list) list.push(entry);
    else byCard.set(entry.cardId, [entry]);
  }

  for (const card of cards) {
    const stored = card.stability !== null && card.lastReviewed !== null;
    // Memory states in time order: each is the review instant and the stability after it.
    const states = (byCard.get(card.id) ?? [])
      .filter((entry) => entry.timestamp <= now && (!stored || entry.timestamp < (card.lastReviewed as number)))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => ({ at: entry.timestamp, stability: entry.stabilityAfter }));
    if (stored) states.push({ at: card.lastReviewed as number, stability: card.stability as number });
    if (states.length === 0) continue;

    let index = -1;
    for (let k = 0; k < count; k++) {
      while (index + 1 < states.length && states[index + 1].at <= times[k]) index++;
      if (index < 0) continue;
      const state = states[index];
      sums[k] += forgettingCurve(Math.max(end - state.at, 0) / MS_PER_DAY, state.stability, decay);
    }
  }

  const n = cards.length;
  return times.map((at, k) => ({ at, recall: n === 0 ? 0 : sums[k] / n }));
}
