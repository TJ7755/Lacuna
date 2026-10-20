// The keep-up simulation loads the FSRS engine, so the dashboard imports this module
// lazily to keep it out of the initial bundle.
import type { Card } from '../db/types';
import { courseForecast, type ForecastCourse, type ForecastPoint } from './courseForecast';
import { applyReview, makeEngine, toTsCard } from './fsrs';
import { rAtExam } from './forwardSim';

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
