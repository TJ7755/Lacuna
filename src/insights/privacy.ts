/**
 * Owner-authored privacy rules for class insights (issue #588).
 *
 * Three mechanisms bound what a teacher may see:
 * - Suppression: a cell with fewer than {@link SUPPRESSION_THRESHOLD} contributing
 *   devices is returned suppressed and never publishes a number.
 * - Banding: a visible cell carries a coarse band (secure, developing or weak) and a
 *   presented contributor count, but never an exact rate, so subtracting adjacent
 *   weeks or overlapping cells cannot recover one device's result.
 * - Count presentation: near-threshold cohorts are grouped as "fewer than K", and
 *   mid-sized cohorts round to the nearest five, so a single device's arrival or
 *   departure cannot be read from week to week; counts from
 *   {@link EXACT_DEVICE_COUNT_MINIMUM} are shown exactly.
 *
 * Fail-closed: aggregates that violate the module's contract (non-integers, negative
 * counts, a numerator greater than the denominator, or a zero denominator) are
 * suppressed rather than thrown, so corrupt data can never reveal evidence through a
 * crash or a wrong number.
 *
 * Known residual risk, recorded per issue #588: a teacher who independently knows one
 * pupil's attendance, or has background knowledge of one cohort member, can still
 * narrow a pupil's band by elimination when the class sits at the threshold, because
 * they can compare adjacent weeks that each just clear K. Because every published
 * value is a coarse band plus a roundable count, the inference is a range rather than
 * a result, and a device that drops the class below K hides it entirely. Differential
 * privacy noise was deliberately rejected for v1 (issue #588 non-goals) as too hard to
 * explain to a school at trial scale.
 *
 * The values are provisional pending the trial (plan for issues #588-#594): K = 5,
 * band boundaries at 0.8 and 0.5, bands of five devices, and exact counts from 25.
 */

export const SUPPRESSION_THRESHOLD = 5;

export const EXACT_DEVICE_COUNT_MINIMUM = 25;

/** Lower bound (inclusive) of each band above weak. Rates below 0.5 are weak. */
export const BAND_LOWER_BOUNDS = { secure: 0.8, developing: 0.5 } as const;

export type InsightBand = 'secure' | 'developing' | 'weak';

export interface InsightCellInput {
  /** Devices with at least one scoring opportunity in this cell. */
  contributors: number;
  /** Full-credit opportunities, or marks earned, summed across the cell. */
  numerator: number;
  /** Scored opportunities, or marks available, summed across the cell. */
  denominator: number;
}

/** A device count as the teacher sees it: grouped, rounded or exact. */
export type DeviceCount =
  | { kind: 'fewer'; limit: number }
  | { kind: 'about'; value: number }
  | { kind: 'exact'; value: number };

export type InsightCell =
  { kind: 'suppressed' } | { kind: 'band'; band: InsightBand; contributors: DeviceCount };

/**
 * The band a rate falls in. Rates at or above {@link BAND_LOWER_BOUNDS.secure} are
 * secure and rates at or above {@link BAND_LOWER_BOUNDS.developing} are developing;
 * anything lower is weak.
 */
export function bandForRate(rate: number): InsightBand {
  if (rate >= BAND_LOWER_BOUNDS.secure) return 'secure';
  if (rate >= BAND_LOWER_BOUNDS.developing) return 'developing';
  return 'weak';
}

/**
 * Presents a device count for display. Cohorts below the suppression threshold are
 * grouped as "fewer than K", cohorts up to {@link EXACT_DEVICE_COUNT_MINIMUM} round to
 * the nearest five, and larger counts are exact. Malformed counts are grouped rather
 * than throwing, so a corrupt merge cannot publish a misleading size.
 */
export function presentDeviceCount(count: number): DeviceCount {
  if (!Number.isSafeInteger(count) || count < SUPPRESSION_THRESHOLD) {
    return { kind: 'fewer', limit: SUPPRESSION_THRESHOLD };
  }
  if (count >= EXACT_DEVICE_COUNT_MINIMUM) return { kind: 'exact', value: count };
  return {
    kind: 'about',
    value: Math.round(count / SUPPRESSION_THRESHOLD) * SUPPRESSION_THRESHOLD,
  };
}

/**
 * Returns the view of one aggregate cell (a Concept retention signal or a mark-scheme
 * criterion rate) that a teacher may see.
 *
 * Callers must only count devices whose denominator for the cell is greater than zero,
 * so a device with no evidence can never push a lone device's result into the view of
 * the whole class.
 */
export function insightCell(input: InsightCellInput): InsightCell {
  const { contributors, numerator, denominator } = input;
  // Fail closed: cheap magnitude checks first, then Number.isSafeInteger, which
  // incidentally rejects NaN, infinities and non-integers.
  if (
    contributors < SUPPRESSION_THRESHOLD ||
    numerator < 0 ||
    numerator > denominator ||
    denominator === 0 ||
    !Number.isSafeInteger(contributors) ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator)
  ) {
    return { kind: 'suppressed' };
  }
  return {
    kind: 'band',
    band: bandForRate(numerator / denominator),
    contributors: presentDeviceCount(contributors),
  };
}
