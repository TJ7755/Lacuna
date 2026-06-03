// FSRS-4.5 default parameters and shared constants.

/** The 17 default FSRS-4.5 weights. */
export const W: readonly number[] = [
  0.4872, 1.4002, 3.7147, 12.1207, 4.9033, 0.9407, 1.4111, 0.0524, 1.6212,
  0.1637, 1.0289, 0.4437, 1.4019, 0.0573, 2.2045, 0.2466, 2.9403,
];

/** Constant in the forgetting curve: (1 + FACTOR * t/S)^DECAY. */
export const FACTOR = 19 / 81;
export const DECAY = -0.5;

/** Difficulty is always clamped to [1, 10]. */
export const D_MIN = 1.0;
export const D_MAX = 10.0;

/** Stability is never permitted to fall to zero. */
export const S_MIN = 0.1;

/** Retrievability threshold that counts a card as "mastered" for the progress bar. */
export const MASTERY_R = 0.9;

/** Milliseconds in a day, for converting timestamps to FSRS day units. */
export const MS_PER_DAY = 86_400_000;
