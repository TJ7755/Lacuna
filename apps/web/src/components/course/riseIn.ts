// Page-arrival motion shared by the lesson and card editor pages: each section
// rises in on a ~40 ms stagger. Scaled by the motion setting and skipped
// entirely when motion is off (multiplier 0).

import { motionTransition } from '../ui/motion';

export function riseIn(index: number, multiplier: number) {
  return {
    initial: multiplier > 0 ? { opacity: 0, y: 10 } : (false as const),
    animate: { opacity: 1, y: 0 },
    transition: {
      ...motionTransition('milestone', multiplier, 'emphasised'),
      delay: index * 0.04 * multiplier,
    },
  };
}
