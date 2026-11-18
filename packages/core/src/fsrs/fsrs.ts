// FSRS-7 scheduling and memory transitions belong to ts-fsrs. Lacuna only maps
// persisted memory and config; exam allocation remains in the objective layer.
import { dateChrono, defineScheduler, State, type Grade as TsGrade } from 'ts-fsrs';
import type { StepUnit } from 'ts-fsrs/middlewares';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
} from 'ts-fsrs/middlewares';
import { FSRS7Model, type FSRS7ModelCore, type FSRS7State } from 'ts-fsrs/models/fsrs-7';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card, FsrsCardState, FsrsParameters, Grade } from '@lacuna/core/db/types';

const definition = defineScheduler({ model: FSRS7Model, chrono: dateChrono }).use(
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
);

export type FsrsEngine = ReturnType<typeof definition.create>;
export type FsrsCard = ReturnType<FsrsEngine['newCard']>;

export type SchedulingMemory = Pick<
  Card,
  | 'due'
  | 'stability'
  | 'difficulty'
  | 'lastReviewed'
  | 'scheduledDays'
  | 'learningSteps'
  | 'reps'
  | 'lapses'
  | 'state'
> & { id?: string; stabilityFast?: number | null };

/** Preserve the configured learning, fuzzing and interval policies. */
export function makeEngine(params: FsrsParameters): FsrsEngine {
  return definition.create({
    config: {
      weights: params.w,
      fractionalDays: true,
      desiredRetention: params.requestRetention,
      enableShortTerm: true,
      // Retain configured learning steps during the model upgrade.
      allowModelOverride: false,
      enableFuzz: params.enable_fuzz,
      maximumInterval: params.maximum_interval,
      learningSteps: params.learning_steps as StepUnit[],
      relearningSteps: params.relearning_steps as StepUnit[],
      clearStatsOnForget: false,
    },
  });
}

export function modelOf(params: FsrsParameters): FSRS7ModelCore {
  return FSRS7Model.create({ config: { weights: params.w } });
}

/** Only complete memory states can be used for recall predictions. */
export function memoryState(
  card: Pick<SchedulingMemory, 'stability' | 'stabilityFast' | 'difficulty'>,
): FSRS7State {
  const { stability, stabilityFast, difficulty } = card;
  if (
    stability === null ||
    !Number.isFinite(stability) ||
    stability <= 0 ||
    stabilityFast === null ||
    stabilityFast === undefined ||
    !Number.isFinite(stabilityFast) ||
    stabilityFast <= 0 ||
    difficulty === null ||
    !Number.isFinite(difficulty) ||
    difficulty < 1 ||
    difficulty > 10
  ) {
    throw new Error('FSRS-7 requires valid memory with both stability traces.');
  }
  return { stability, stabilityFast, difficulty };
}

export function toTsCard(card: SchedulingMemory, now: number): FsrsCard {
  const fresh = card.state === State.New;
  const opaque = !fresh && (card.stabilityFast === null || card.stabilityFast === undefined);
  // Zero model memory initialises from the next answer without resetting schedule progress.
  return definition.schema.card.parse({
    cardId: card.id ?? 'projection',
    ...(fresh || opaque ? { stability: 0, stabilityFast: 0, difficulty: 0 } : memoryState(card)),
    dueAt: new Date(card.due ?? card.lastReviewed ?? now),
    // With no timestamp or model memory, the next real answer starts at elapsed zero.
    lastReviewAt: fresh ? null : new Date(card.lastReviewed ?? now),
    scheduledDays: card.scheduledDays,
    learningStep: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: fresh ? State.New : card.state,
    scheduleStatus: fresh ? 'new' : card.state === State.Review ? 'review' : 'learning',
  });
}

/** Memory fields written together after a review. New cards acquire both traces. */
export interface MemoryUpdate {
  stability: number;
  stabilityFast: number;
  difficulty: number;
  lastReviewed: number;
  due: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: FsrsCardState;
}

function fromTsCard(ts: FsrsCard, now: number): MemoryUpdate {
  return {
    stability: ts.stability,
    stabilityFast: ts.stabilityFast,
    difficulty: ts.difficulty,
    lastReviewed: ts.lastReviewAt?.getTime() ?? now,
    due: ts.dueAt.getTime(),
    scheduledDays: ts.scheduledDays,
    learningSteps: ts.learningStep,
    reps: ts.reps,
    lapses: ts.lapses,
    state: ts.state as FsrsCardState,
  };
}

export interface ReviewResult {
  memory: MemoryUpdate;
  retrievabilityAtReview: number | null;
}

export function applyReview(
  engine: FsrsEngine,
  card: SchedulingMemory,
  grade: Grade,
  now: number,
): ReviewResult {
  const before = toTsCard(card, now);
  const retrievabilityAtReview =
    before.lastReviewAt === null || card.stabilityFast === null || card.stabilityFast === undefined
      ? null
      : engine.model.forgettingCurve(
          before,
          Math.max(now - before.lastReviewAt.getTime(), 0) / MS_PER_DAY,
        );
  const item = engine.review({ card: before, now: new Date(now), grade: grade as TsGrade });
  return { memory: fromTsCard(item.card, now), retrievabilityAtReview };
}
