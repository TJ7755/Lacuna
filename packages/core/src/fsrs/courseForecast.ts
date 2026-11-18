// Course recall forecast (pure; no Dexie, no React).
//
// Answers "if I stopped studying now, how much would I recall on exam day?" for the
// dashboard, and how that answer has moved over recent days. No future reviews are
// assumed: a forecast that presumes every card is reviewed on time, and answered
// Good, flatters a course that has barely been started.
//
//  - an unreviewed card contributes 0 recall;
//  - a course without a future exam is measured `steadyDays` ahead instead.

import type { Card, SchedulerConfig } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import { modelOf } from '@lacuna/core/fsrs/fsrs';
import { forgettingCurve, rAtExam } from '@lacuna/core/fsrs/forwardSim';
import { MS_PER_DAY, clampRequestRetention } from '@lacuna/core/fsrs/params';

export interface ForecastPoint {
  /** Epoch ms. */
  at: number;
  /** Mean exam-day retrievability across the course's cards, 0..1. */
  recall: number | null;
}

export interface CourseForecast {
  end: number;
  hasExam: boolean;
  target: number;
  /** Mean recall at `end` if no further reviews happen. */
  ifStopped: number | null;
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
  const model = modelOf(course.fsrsParameters);
  const predictions = cards.map((card) => rAtExam(card, end, now, model));
  const sum = predictions.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {
    end,
    hasExam,
    target: clampRequestRetention(course.fsrsParameters.requestRetention),
    ifStopped: predictions.some((value) => value === null)
      ? null
      : cards.length === 0
        ? 0
        : sum / cards.length,
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
  const unavailable = new Array<boolean>(count).fill(false);
  const model = modelOf(course.fsrsParameters);

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
      .filter(
        (entry) =>
          entry.timestamp <= now && (!stored || entry.timestamp < (card.lastReviewed as number)),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => ({
        at: entry.timestamp,
        stability: entry.stabilityAfter,
        difficulty: entry.difficultyAfter,
        stabilityFast:
          (entry as ReviewHistoryEntry & { stabilityFastAfter?: number | null })
            .stabilityFastAfter ?? null,
      }));
    if (stored)
      states.push({
        at: card.lastReviewed as number,
        stability: card.stability as number,
        stabilityFast: card.stabilityFast,
        difficulty: card.difficulty as number,
      });
    if (states.length === 0) continue;

    let index = -1;
    for (let k = 0; k < count; k++) {
      while (index + 1 < states.length && states[index + 1].at <= times[k]) index++;
      if (index < 0) continue;
      const state = states[index];
      const prediction = forgettingCurve(Math.max(end - state.at, 0) / MS_PER_DAY, state, model);
      if (prediction === null) unavailable[k] = true;
      else sums[k] += prediction;
    }
  }

  const n = cards.length;
  return times.map((at, k) => ({ at, recall: unavailable[k] ? null : n === 0 ? 0 : sums[k] / n }));
}
