// FSRS-6 defaults and shared constants.
//
// The maths itself lives in the official `ts-fsrs` package (FSRS-6, 21 trainable
// parameters including the decay w20). This module only re-exports the default
// parameter set and the handful of app-level constants used across the codebase.

import {
  default_w,
  default_request_retention,
  default_maximum_interval,
  default_enable_fuzz,
  default_learning_steps,
  default_relearning_steps,
} from 'ts-fsrs';
import type { FsrsParameters } from '../db/types';

/** FSRS algorithm version persisted alongside each deck's parameters. */
export const FSRS_VERSION = 6;

/** Default target retention used by ts-fsrs when scheduling. */
export const DEFAULT_REQUEST_RETENTION = default_request_retention;

/** Bounds for the user-facing target-retention control. */
export const MIN_REQUEST_RETENTION = 0.8;
export const MAX_REQUEST_RETENTION = 0.97;

/** Clamp a target-retention value to the supported range. */
export function clampRequestRetention(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REQUEST_RETENTION;
  return Math.min(MAX_REQUEST_RETENTION, Math.max(MIN_REQUEST_RETENTION, value));
}

/** A fresh copy of the default FSRS-6 parameter set for a new (or migrated) deck. */
export function defaultFsrsParameters(): FsrsParameters {
  return {
    w: [...default_w],
    requestRetention: default_request_retention,
    enable_fuzz: default_enable_fuzz,
    maximum_interval: default_maximum_interval,
    learning_steps: [...default_learning_steps],
    relearning_steps: [...default_relearning_steps],
  };
}

/** Retrievability threshold that counts a card as "secured" on exam day. */
export const MASTERY_R = 0.9;

/** Milliseconds in a day, for converting timestamps to FSRS day units. */
export const MS_PER_DAY = 86_400_000;
