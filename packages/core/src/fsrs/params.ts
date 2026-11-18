// FSRS-7 defaults; the official model owns the 34 trainable weights.

import {
  DEFAULT_MAXIMUM_INTERVAL,
  defaultLearningSteps,
  defaultRelearningSteps,
} from 'ts-fsrs/middlewares';
import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import type { FsrsParameters } from '@lacuna/core/db/types';

/** FSRS algorithm version persisted alongside each deck's parameters. */
export const FSRS_VERSION = 7;

/** Default target retention used by ts-fsrs when scheduling. */
export const DEFAULT_REQUEST_RETENTION = 0.9;

/** Bounds for the user-facing target-retention control. */
export const MIN_REQUEST_RETENTION = 0.8;
export const MAX_REQUEST_RETENTION = 0.97;

/** Clamp a target-retention value to the supported range. */
export function clampRequestRetention(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REQUEST_RETENTION;
  return Math.min(MAX_REQUEST_RETENTION, Math.max(MIN_REQUEST_RETENTION, value));
}

/** A fresh copy of the default FSRS-7 parameter set for a new (or migrated) deck. */
export function defaultFsrsParameters(): FsrsParameters {
  return {
    w: [...FSRS7_DEFAULT_WEIGHTS],
    requestRetention: DEFAULT_REQUEST_RETENTION,
    enable_fuzz: true,
    maximum_interval: DEFAULT_MAXIMUM_INTERVAL,
    learning_steps: [...defaultLearningSteps],
    relearning_steps: [...defaultRelearningSteps],
  };
}

/** Retrievability threshold that counts a card as "secured" on exam day. */
export const MASTERY_R = 0.9;

/** Milliseconds in a day, for converting timestamps to FSRS day units. */
export const MS_PER_DAY = 86_400_000;
