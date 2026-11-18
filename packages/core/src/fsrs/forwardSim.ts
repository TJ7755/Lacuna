// Forward simulation changes predicted recall, never exam allocation policy.
import { Rating } from 'ts-fsrs';
import type { FSRS7ModelCore } from 'ts-fsrs/models/fsrs-7';
import {
  toTsCard,
  memoryState,
  type FsrsEngine,
  type SchedulingMemory,
} from '@lacuna/core/fsrs/fsrs';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { SchedulerConfig, Grade } from '@lacuna/core/db/types';

/** Both traces and difficulty are required by FSRS-7's mixture curve. */
export function forgettingCurve(
  days: number,
  state: Pick<SchedulingMemory, 'stability' | 'stabilityFast' | 'difficulty'>,
  model: FSRS7ModelCore,
): number | null {
  if (state.stabilityFast === null || state.stabilityFast === undefined) return null;
  if (!Number.isFinite(days)) return 0;
  return model.forgettingCurve(memoryState(state), Math.max(days, 0));
}

export interface SimContext {
  fsrs: FsrsEngine;
  model: FSRS7ModelCore;
  expectedGrade: Grade;
}

export function simContext(_deck: SchedulerConfig, engine: FsrsEngine): SimContext {
  return { fsrs: engine, model: engine.model, expectedGrade: Rating.Good as Grade };
}

/** Unintroduced cards contribute no predicted recall. */
export function rAtExam(
  card: SchedulingMemory,
  examDate: number,
  _now: number,
  model: FSRS7ModelCore,
): number | null {
  if (card.state === 0) return 0;
  if (card.lastReviewed === null) return null;
  return forgettingCurve((examDate - card.lastReviewed) / MS_PER_DAY, card, model);
}

export function rAtExamIfReviewedNow(
  card: SchedulingMemory,
  grade: Grade,
  examDate: number,
  now: number,
  ctx: SimContext,
): number {
  const item = ctx.fsrs.review({ card: toTsCard(card, now), now: new Date(now), grade });
  return ctx.model.forgettingCurve(item.card, Math.max(examDate - now, 0) / MS_PER_DAY);
}

export function deltaR(
  card: SchedulingMemory,
  examDate: number,
  now: number,
  ctx: SimContext,
  grade: Grade = ctx.expectedGrade,
): number {
  return (
    rAtExamIfReviewedNow(card, grade, examDate, now, ctx) -
    (rAtExam(card, examDate, now, ctx.model) ?? 0)
  );
}
