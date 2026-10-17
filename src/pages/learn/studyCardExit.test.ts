import { animateValue } from 'motion/react';
import { describe, expect, it } from 'vitest';
import { studyCardExitTransition } from './studyCardExit';

function sample(multiplier = 1, from = 0, to = 420, velocity = 0) {
  const transition = studyCardExitTransition(multiplier, from, to, velocity);
  const animation = animateValue({
    ...transition,
    duration: transition.duration * 1000,
    keyframes: [from, to],
    autoplay: false,
  });
  return {
    at(ms: number) {
      return animation.sample(ms).value;
    },
    stop: () => animation.stop(),
  };
}

describe('study card departure physics', () => {
  it('accelerates visibly from rest and takes 560ms to reach its off-screen target', () => {
    const motion = sample();
    try {
      expect(motion.at(16)).toBeGreaterThan(0);
      const first = motion.at(100);
      const second = motion.at(200);
      const third = motion.at(300);
      expect(first).toBeLessThan(20);
      expect(second - first).toBeGreaterThan(first * 2);
      expect(third - second).toBeGreaterThan(second - first);
      expect(motion.at(450)).toBeLessThan(420 * 0.8);
      expect(motion.at(560)).toBeCloseTo(420, 1);
    } finally {
      motion.stop();
    }
  });

  it.each([-1, 1])('inherits a slow release velocity in direction %s', (direction) => {
    const motion = sample(1, direction * 100, direction * 500, direction * 240);
    try {
      const speed = (motion.at(1) - direction * 100) * 1000;
      expect(speed).toBeCloseTo(direction * 240, -1);
      expect(Math.abs(motion.at(450))).toBeLessThan(500);
    } finally {
      motion.stop();
    }
  });

  it.each([0.6, 1.4])('scales elapsed motion with multiplier %s', (multiplier) => {
    const normal = sample();
    const scaled = sample(multiplier);
    try {
      expect(scaled.at(250 * multiplier)).toBeCloseTo(normal.at(250), 1);
    } finally {
      normal.stop();
      scaled.stop();
    }
  });

  it('caps a hard flick and keeps its flight at least 360ms long', () => {
    const motion = sample(1, 100, 500, 30_000);
    try {
      expect(motion.at(1) - 100).toBeLessThan(2.4);
      expect(motion.at(300)).toBeLessThan(500);
      expect(motion.at(360)).toBeCloseTo(500, 1);
    } finally {
      motion.stop();
    }
  });

  it('skips travel when reduced motion is enabled', () => {
    expect(studyCardExitTransition(0, 0, 420, 0).duration).toBe(0);
  });
});
