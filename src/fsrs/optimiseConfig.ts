/**
 * Minimum number of reviews before optimisation is worthwhile. Below this the fit
 * is dominated by noise, so the action is gated and the threshold is stated in the
 * UI copy. With fewer than 1,000 reviews a train/validation split leaves too little
 * data to judge out-of-sample performance reliably.
 */
export const MIN_OPTIMISE_REVIEWS = 1_000;
