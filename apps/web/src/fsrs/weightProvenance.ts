import type { FsrsParameters } from '../db/types';

/**
 * Return a short, deterministic fingerprint for the FSRS memory-model weights.
 *
 * The `w` array defines the memory model that produces the prediction, whereas
 * `requestRetention` only affects interval choice. Including it would fragment
 * analysis groups for a change that does not alter any prediction.
 */
export function fsrsWeightsFingerprint(params: FsrsParameters): string {
  const roundedWeights = params.w.map((weight) => weight.toFixed(6)).join(',');
  let hash = 0x811c9dc5;

  for (let index = 0; index < roundedWeights.length; index += 1) {
    hash ^= roundedWeights.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `w1:${hash.toString(16).padStart(8, '0')}`;
}
