// Course recall forecast (pure; no Dexie, no React).
//
// Answers "if I keep to the schedule, what will my average recall be between now
// and the exam?" for the dashboard. Each card is simulated once, forward through
// time, and its recall is recorded at every sample time, so the cost is
// O(cards x reviews), not O(cards x samples x reviews).
//
// Assumptions (deliberately simple and deterministic, no randomness):
//  - every simulated review is answered Good;
//  - a card is next reviewed when its retrievability falls to the target
//    retention, or immediately (at `now`) if that moment has already passed;
//  - unreviewed cards are introduced in their given order at the course's
//    daily new-card allowance, starting today. An absent or zero allowance means
//    unlimited, as everywhere else in the app, so all are introduced today;
//  - an unintroduced card contributes 0 recall.

import type { FSRS } from 'ts-fsrs';
import { Rating, type Card as TsCard, type Grade as TsGrade } from 'ts-fsrs';
import type { Card, SchedulerConfig } from '../db/types';
import { makeEngine, toTsCard } from './fsrs';
import { curveFactor, forgettingCurve, rAtExam } from './forwardSim';
import { MS_PER_DAY, clampRequestRetention } from './params';

export interface ForecastPoint {
  /** Epoch ms. */
  at: number;
  /** Mean retrievability across the course's cards, 0..1. */
  recall: number;
}

export interface CourseForecast {
  start: number;
  end: number;
  hasExam: boolean;
  target: number;
  current: number;
  ifStopped: number;
  atEnd: number;
  series: ForecastPoint[];
  /**
   * The exam-day (or horizon) forecast as it would stand on each sample day: mean
   * recall at `end` given the reviews made by then. It starts at `ifStopped`, only
   * rises as reviews land, and finishes at `atEnd`.
   */
  outlook: ForecastPoint[];
}

export interface CourseForecastOptions {
  samples?: number;
  steadyDays?: number;
  engine?: FSRS;
}

/** Defensive ceiling on simulated reviews per card. */
const MAX_REVIEWS_PER_CARD = 60;
/** Smallest gap between simulated reviews, in days, so a pathological card cannot stall. */
const MIN_GAP_DAYS = 0.01;

export function courseForecast(
  cards: Card[],
  course: SchedulerConfig & { examDate?: number; newCardsPerDay?: number },
  now: number,
  options: CourseForecastOptions = {},
): CourseForecast {
  const samples = Math.max(2, Math.floor(options.samples ?? 24));
  const steadyDays = options.steadyDays ?? 28;
  const hasExam = course.examDate !== undefined && course.examDate > now;
  const end = hasExam ? (course.examDate as number) : now + steadyDays * MS_PER_DAY;
  const params = course.fsrsParameters;
  const target = clampRequestRetention(params.requestRetention);
  const decay = -params.w[20];
  const factor = curveFactor(decay);
  const engine = options.engine ?? makeEngine({ ...params, enable_fuzz: false });
  const allowance = Math.floor(course.newCardsPerDay ?? 0);

  const times: number[] = [];
  for (let k = 0; k < samples; k++) times.push(now + ((end - now) * k) / (samples - 1));
  const sums = new Array<number>(samples).fill(0);
  const outlookSums = new Array<number>(samples).fill(0);

  const n = cards.length;
  let currentSum = 0;
  let stoppedSum = 0;
  let introduced = 0;

  /** Days from a review at which R falls to the target, for stability S. */
  const daysToTarget = (S: number): number =>
    Math.max(MIN_GAP_DAYS, (S * (Math.pow(target, 1 / decay) - 1)) / factor);

  for (const card of cards) {
    const reviewed = card.stability !== null && card.lastReviewed !== null;
    currentSum += rAtExam(card, now, now, decay);
    stoppedSum += rAtExam(card, end, now, decay);

    let ts: TsCard;
    let last: number;
    let stability: number;
    let nextReview: number;
    if (reviewed) {
      ts = toTsCard(card, now);
      last = card.lastReviewed as number;
      stability = card.stability as number;
      nextReview = Math.max(now, last + daysToTarget(stability) * MS_PER_DAY);
    } else {
      const day = allowance > 0 ? Math.floor(introduced / allowance) : 0;
      introduced++;
      nextReview = now + day * MS_PER_DAY;
      ts = toTsCard({ ...card, lastReviewed: null }, nextReview);
      last = -Infinity;
      stability = 0;
    }

    let reviews = 0;
    let live = reviewed;
    for (let k = 0; k < samples; k++) {
      const t = times[k];
      while (reviews < MAX_REVIEWS_PER_CARD && nextReview <= t) {
        const item = engine.next(ts, new Date(nextReview), Rating.Good as TsGrade);
        ts = item.card;
        stability = ts.stability;
        last = nextReview;
        live = true;
        reviews++;
        nextReview = last + daysToTarget(stability) * MS_PER_DAY;
      }
      if (live) {
        sums[k] += forgettingCurve((t - last) / MS_PER_DAY, stability, decay);
        outlookSums[k] += forgettingCurve((end - last) / MS_PER_DAY, stability, decay);
      }
    }
  }

  const mean = (v: number): number => (n === 0 ? 0 : v / n);
  const current = mean(currentSum);
  const series: ForecastPoint[] = times.map((at, k) => ({ at, recall: mean(sums[k]) }));
  series[0] = { at: now, recall: current };
  const ifStopped = mean(stoppedSum);
  const outlook: ForecastPoint[] = times.map((at, k) => ({ at, recall: mean(outlookSums[k]) }));
  outlook[0] = { at: now, recall: ifStopped };

  return {
    start: now,
    end,
    hasExam,
    target,
    current,
    ifStopped,
    atEnd: series[samples - 1].recall,
    series,
    outlook,
  };
}
