/**
 * FSRS wrapper around ts-fsrs.
 *
 * This module exports a thin wrapper over the ts-fsrs library so that the rest
 * of the application is insulated from the underlying library's API shape.
 * All spaced-repetition logic flows through here.
 */

import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

export type { Rating };
export { createEmptyCard };

const params = generatorParameters();

/** Shared FSRS instance. */
export const scheduler = fsrs(params);

export type FsrsRating = Rating;
