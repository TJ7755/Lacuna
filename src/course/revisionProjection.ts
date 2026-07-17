import type { RevisionProjection } from '../db/types';

/** Honest runtime boundary until the deferred short-term model gate supplies a model. */
export const revisionProjection: RevisionProjection = {
  projectionMode: 'fsrs-6-practice-fallback',
  memoryModelVersion: 'fsrs-6',
  fallbackReason: 'missing',
};
