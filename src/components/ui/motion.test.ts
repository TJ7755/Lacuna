import { describe, expect, it } from 'vitest';

import {
  MOTION_DURATION,
  MOTION_EASING,
  motionDuration,
  motionTransition,
  expandingActionSpring,
} from './motion';

describe('motion contract', () => {
  it('uses a physical expansion spring with a stable damping ratio across speeds', () => {
    const normal = expandingActionSpring(1);
    const slow = expandingActionSpring(1.4);
    expect(normal).toEqual(expect.objectContaining({ type: 'spring', mass: 1 }));
    expect(normal).not.toHaveProperty('visualDuration');
    expect(normal).not.toHaveProperty('duration');
    if (!('stiffness' in normal) || !('stiffness' in slow))
      throw new Error('Expected physical springs');
    const dampingRatio = normal.damping / (2 * Math.sqrt(normal.stiffness * normal.mass));
    expect(dampingRatio).toBeGreaterThanOrEqual(0.85);
    expect(dampingRatio).toBeLessThanOrEqual(1);
    expect(slow.stiffness).toBeCloseTo(normal.stiffness / 1.4 ** 2);
    expect(slow.damping).toBeCloseTo(normal.damping / 1.4);
    expect(slow.damping / (2 * Math.sqrt(slow.stiffness * slow.mass))).toBeCloseTo(dampingRatio);
    expect(expandingActionSpring(0)).toEqual({ duration: 0 });
  });
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
