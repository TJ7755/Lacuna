import { afterEach, expect, it, vi } from 'vitest';
import { speedMultiplier } from './motionSpeed';

afterEach(() => vi.restoreAllMocks());

it.each([
  [false, 'slow', 1.4],
  [false, 'normal', 1],
  [false, 'fast', 0.6],
  [true, 'normal', 0],
] as const)(
  'uses the correct multiplier with reduced motion=%s and speed=%s',
  (reduced, speed, expected) => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(media, 'matches', 'get').mockReturnValue(reduced);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    expect(speedMultiplier(speed)).toBe(expected);
  },
);
