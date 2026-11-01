import { createEmptyCard, type Card as TsCard, type Grade as TsGrade, type State } from 'ts-fsrs';
import type { FsrsParameters, Grade } from '../db/types';
import { makeEngine } from '../fsrs/fsrs';
import { MS_PER_DAY } from '../fsrs/params';
import {
  QUESTION_SCHEDULER_VERSION,
  type QuestionAttempt,
  type QuestionDefinition,
  type QuestionScheduleState,
} from './types';

export interface QuestionReviewResult {
  schedule: QuestionScheduleState;
  retrievabilityAtAttempt: number | null;
  schedulerVersion: typeof QUESTION_SCHEDULER_VERSION;
  schedulerConfigFingerprint: string;
  schedulerConfig: FsrsParameters;
}

/** Question scheduling is deterministic: interval fuzz would make undo replay diverge. */
export function normaliseQuestionSchedulerConfig(params: FsrsParameters): FsrsParameters {
  return {
    w: [...params.w],
    requestRetention: params.requestRetention,
    enable_fuzz: false,
    maximum_interval: params.maximum_interval,
    learning_steps: [...params.learning_steps],
    relearning_steps: [...params.relearning_steps],
  };
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}

/** Fingerprint the complete deterministic configuration, not merely FSRS weights. */
export function questionSchedulerConfigFingerprint(params: FsrsParameters): string {
  const config = normaliseQuestionSchedulerConfig(params);
  const serialised = JSON.stringify([
    QUESTION_SCHEDULER_VERSION,
    config.w,
    config.requestRetention,
    config.enable_fuzz,
    config.maximum_interval,
    config.learning_steps,
    config.relearning_steps,
  ]);
  return `qfsrs1:${hash(serialised)}`;
}

export function emptyQuestionSchedule(): QuestionScheduleState {
  return {
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
  };
}

function toTsCard(schedule: QuestionScheduleState, now: number): TsCard {
  if (schedule.lastReviewed === null) return createEmptyCard(new Date(now));

  return {
    due: new Date(schedule.due ?? schedule.lastReviewed),
    stability: schedule.stability ?? 0.1,
    difficulty: schedule.difficulty ?? 5,
    elapsed_days: Math.max(0, Math.floor((now - schedule.lastReviewed) / MS_PER_DAY)),
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state as State,
    last_review: new Date(schedule.lastReviewed),
  };
}

function fromTsCard(card: TsCard, now: number): QuestionScheduleState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    lastReviewed: card.last_review?.getTime() ?? now,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as QuestionScheduleState['state'],
    due: card.due.getTime(),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}

/** Apply one Question grade without reading or writing Card state. */
export function scheduleQuestionReview(
  schedule: QuestionScheduleState,
  grade: Grade,
  params: FsrsParameters,
  now: number,
): QuestionReviewResult {
  const schedulerConfig = normaliseQuestionSchedulerConfig(params);
  const engine = makeEngine(schedulerConfig);
  const before = toTsCard(schedule, now);
  const retrievabilityAtAttempt =
    schedule.lastReviewed === null || schedule.state === 0
      ? null
      : engine.get_retrievability(before, now, false);
  const result = engine.next(before, new Date(now), grade as TsGrade);

  return {
    schedule: fromTsCard(result.card, now),
    retrievabilityAtAttempt,
    schedulerVersion: QUESTION_SCHEDULER_VERSION,
    schedulerConfigFingerprint: questionSchedulerConfigFingerprint(schedulerConfig),
    schedulerConfig,
  };
}

function baselineSchedule(
  question: Pick<QuestionDefinition, 'scheduleEpoch'>,
): QuestionScheduleState {
  const baseline = question.scheduleEpoch.baseline;
  return baseline.kind === 'legacy-opaque'
    ? {
        ...baseline.state,
      }
    : emptyQuestionSchedule();
}

/**
 * Rebuild the current epoch after undo or merge. Answer receipts remain immutable;
 * only active replay effects are applied, and opaque legacy evidence stays in its baseline.
 */
export function replayQuestionSchedule(
  question: Pick<QuestionDefinition, 'scheduleEpoch'>,
  attempts: readonly QuestionAttempt[],
  fallbackParams: FsrsParameters,
): QuestionScheduleState {
  let schedule = baselineSchedule(question);
  let activeConfig = normaliseQuestionSchedulerConfig(fallbackParams);
  const replayable = attempts
    .filter(
      (attempt) =>
        attempt.scheduleEpochId === question.scheduleEpoch.id &&
        attempt.status === 'answered' &&
        attempt.answeredAt !== undefined &&
        attempt.undoneAt === undefined &&
        attempt.scheduleEffect.kind === 'replay',
    )
    .sort(
      (left, right) =>
        (left.answeredAt as number) - (right.answeredAt as number) ||
        left.id.localeCompare(right.id),
    );

  for (const attempt of replayable) {
    const answeredAt = attempt.answeredAt;
    const effect = attempt.scheduleEffect;
    if (answeredAt === undefined || effect.kind !== 'replay') continue;
    if (attempt.schedulerConfig) {
      activeConfig = normaliseQuestionSchedulerConfig(attempt.schedulerConfig);
    }
    if (
      attempt.schedulerConfigFingerprint &&
      attempt.schedulerConfigFingerprint !== questionSchedulerConfigFingerprint(activeConfig)
    ) {
      throw new Error(
        `Question attempt ${attempt.id} has an invalid scheduler configuration fingerprint.`,
      );
    }
    schedule = scheduleQuestionReview(schedule, effect.grade, activeConfig, answeredAt).schedule;
  }

  return schedule;
}
