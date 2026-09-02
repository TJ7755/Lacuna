import { describe, expect, it } from 'vitest';

import { MOTION_DURATION, MOTION_EASING, motionDuration, motionTransition } from './motion';

describe('motion contract', () => {
  it('keeps semantic motion tiers ordered by emphasis', () => {
    expect(MOTION_DURATION.feedback).toBeLessThan(MOTION_DURATION.local);
    expect(MOTION_DURATION.local).toBeLessThan(MOTION_DURATION.milestone);
    expect(MOTION_DURATION.milestone).toBeLessThan(MOTION_DURATION.finale);
  });

  it('scales a semantic duration with the motion preference', () => {
    expect(motionDuration('local', 1.4)).toBeCloseTo(MOTION_DURATION.local * 1.4);
    expect(motionDuration('local', 0.6)).toBeCloseTo(MOTION_DURATION.local * 0.6);
  });

  it('turns semantic transitions inert for reduced motion', () => {
    expect(motionTransition('feedback', 0)).toEqual({
      duration: 0,
      ease: MOTION_EASING.standard,
    });
  });

  it('uses an explicit easing without duplicating timing arithmetic', () => {
    expect(motionTransition('milestone', 1, 'emphasised')).toEqual({
      duration: MOTION_DURATION.milestone,
      ease: MOTION_EASING.emphasised,
    });
  });
});
