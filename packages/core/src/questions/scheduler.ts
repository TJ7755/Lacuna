import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import type { FsrsParameters, Grade } from '@lacuna/core/db/types';
import { applyReview, makeEngine } from '@lacuna/core/fsrs/fsrs';
import {
  QUESTION_SCHEDULER_VERSION,
  type QuestionAttempt,
  type QuestionDefinition,
  type QuestionScheduleState,
} from '@lacuna/core/questions/types';

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
    config.w.length === 21 ? 'fsrs-6-question-v1' : QUESTION_SCHEDULER_VERSION,
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
    stabilityFast: null,
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

/** Apply one Question grade without reading or writing Card state. */
export function scheduleQuestionReview(
  schedule: QuestionScheduleState,
  grade: Grade,
  params: FsrsParameters,
  now: number,
): QuestionReviewResult {
  const schedulerConfig = normaliseQuestionSchedulerConfig(params);
  // Historical receipts remain immutable; their single-trace weights cannot seed FSRS-7.
  if (schedulerConfig.w.length === 21) schedulerConfig.w = [...FSRS7_DEFAULT_WEIGHTS];
  const engine = makeEngine(schedulerConfig);
  const result = applyReview(engine, schedule, grade, now);

  return {
    schedule: result.memory,
    retrievabilityAtAttempt: result.retrievabilityAtReview,
    schedulerVersion: QUESTION_SCHEDULER_VERSION,
    schedulerConfigFingerprint: questionSchedulerConfigFingerprint(schedulerConfig),
    schedulerConfig,
  };
}

function baselineSchedule(
  question: Pick<QuestionDefinition, 'scheduleEpoch'>,
): QuestionScheduleState {
  if (question.scheduleEpoch.memoryOrigin) return { ...question.scheduleEpoch.memoryOrigin };
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
 * Replay the persisted scheduleEffect.grade, including historical binary grades, rather
 * than regrading marks under the current policy and changing an established schedule.
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
        attempt.scheduleEffect.kind === 'replay' &&
        (question.scheduleEpoch.memoryOrigin === undefined ||
          (attempt.answeredAt as number) >
            (question.scheduleEpoch.memoryOrigin.lastReviewed ?? -Infinity)),
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
