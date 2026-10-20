// Course recall forecast (pure; no Dexie, no React).
//
// Answers "if I stopped studying now, how much would I recall on exam day?" for the
// dashboard, and how that answer has moved over recent days. No future reviews are
// assumed in the stop-now estimate. The separate keep-up scenario estimates due
// reviews with retrievability-weighted outcomes rather than assuming every answer is Good.
//
//  - an unreviewed card contributes 0 recall;
//  - a course without a future exam is measured `steadyDays` ahead instead.

import type { Card, SchedulerConfig } from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { forgettingCurve, rAtExam } from './forwardSim';
import { MS_PER_DAY, clampRequestRetention } from './params';
import { applyReview, makeEngine, toTsCard } from './fsrs';

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
 * At each future date, estimate recall on the fixed exam date using reviews up to
 * that date. This is an expected-state approximation: Good/Again memory and due
 * intervals are weighted by recall probability, then merged before the next review.
 * Discrete learning state follows the more probable outcome. It is not a trajectory
 * of recall on each plotted date, nor an exact enumeration of all possible histories.
 *
 * Large courses use 256 deterministic, equally weighted strata ordered by due date;
 * their sampled gains are added to the exact stop-now baseline. Each representative
 * gets at most 64 reviews, after which its last estimate is held. These bounds keep
 * distant exams and minute-long learning steps from monopolising the main thread.
 */
export function keepUpProjection(
  cards: readonly Card[],
  course: ForecastCourse,
  now: number,
): ForecastPoint[] {
  if (course.examDate === undefined || course.examDate <= now || cards.length === 0) return [];
  const end = course.examDate;
  const decay = -course.fsrsParameters.w[20];
  const baseline = courseForecast(cards, course, now).ifStopped;
  const engine = makeEngine({ ...course.fsrsParameters, enable_fuzz: false });
  const ordered = [...cards].sort(
    (a, b) => (a.due ?? now) - (b.due ?? now) || a.id.localeCompare(b.id),
  );
  const count = Math.min(256, ordered.length);
  const representatives = Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * ordered.length) / count);
    const stop = Math.floor(((i + 1) * ordered.length) / count);
    const card = { ...ordered[Math.floor((start + stop) / 2)] };
    const recall = rAtExam(card, end, now, decay);
    return { card, baseline: recall, recall, weight: stop - start, reviews: 0 };
  });
  const points: ForecastPoint[] = [{ at: now, recall: baseline }];
  for (let sample = 1; sample <= 32; sample++) {
    const at = now + ((end - now) * sample) / 32;
    let gain = 0;
    for (const state of representatives) {
      let due = Math.max(now, state.card.due ?? now);
      while (due <= at && state.reviews < 64) {
        const probability =
          state.card.lastReviewed === null
            ? 0
            : engine.get_retrievability(toTsCard(state.card, due), due, false);
        const good = applyReview(engine, state.card, 3, due).memory;
        const again = applyReview(engine, state.card, 1, due).memory;
        const mean = (success: number, failure: number) =>
          probability * success + (1 - probability) * failure;
        state.recall = mean(
          rAtExam({ ...state.card, ...good }, end, due, decay),
          rAtExam({ ...state.card, ...again }, end, due, decay),
        );
        state.card = {
          ...state.card,
          ...(probability >= 0.5 ? good : again),
          stability: mean(good.stability, again.stability),
          difficulty: mean(good.difficulty, again.difficulty),
          due: Math.max(due + 60_000, mean(good.due, again.due)),
          scheduledDays: mean(good.scheduledDays, again.scheduledDays),
        };
        state.reviews++;
        due = state.card.due as number;
      }
      gain += (state.recall - state.baseline) * state.weight;
    }
    // Expected-state compression and sampling must not suggest a loss from keeping up.
    points.push({ at, recall: Math.min(1, Math.max(baseline, baseline + gain / cards.length)) });
  }
  return points;
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
      .filter(
        (entry) =>
          entry.timestamp <= now && (!stored || entry.timestamp < (card.lastReviewed as number)),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => ({ at: entry.timestamp, stability: entry.stabilityAfter }));
    if (stored)
      states.push({ at: card.lastReviewed as number, stability: card.stability as number });
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
