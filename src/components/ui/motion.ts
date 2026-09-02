export const MOTION_DURATION = {
  /** Immediate controls, disclosures and acknowledgement. */
  feedback: 0.16,
  /** Local movement that rewards an action without taking over the page. */
  local: 0.3,
  /** A completed step or other moment that deserves deliberate emphasis. */
  milestone: 0.6,
  /** Rare page-level celebrations and narrative finales. */
  finale: 1.2,
} as const;

export type MotionTier = keyof typeof MOTION_DURATION;

export const MOTION_EASING = {
  /** Default for responsive interface movement. */
  standard: [0.16, 1, 0.3, 1],
  /** Slightly broader arrival for rewards and milestones. */
  emphasised: [0.22, 1, 0.36, 1],
  /** Neutral interpolation for charts and continuous state changes. */
  neutral: [0.25, 0.1, 0.25, 1],
  linear: 'linear',
} as const;

export type MotionEasing = keyof typeof MOTION_EASING;

export function motionDuration(tier: MotionTier, multiplier: number): number {
  return MOTION_DURATION[tier] * multiplier;
}

export function motionTransition(
  tier: MotionTier,
  multiplier: number,
  easing: MotionEasing = 'standard',
) {
  return {
    duration: motionDuration(tier, multiplier),
    ease: MOTION_EASING[easing],
  };
}

/** Scale a physics spring to the requested duration without changing its damping ratio. */
export function scaledSpring(multiplier: number, stiffness: number, damping: number) {
  if (multiplier === 0) return { duration: 0 } as const;
  return {
    type: 'spring' as const,
    stiffness: stiffness / multiplier ** 2,
    damping: damping / multiplier,
  };
}

/**
 * Shared height-collapse configuration for disclosures: expands to auto height and
 * collapses to zero, scaling timing by the motion multiplier and becoming inert
 * entirely (no enter or exit animation) when reduced motion sets it to zero.
 */
export function collapse(multiplier: number, duration = 0.18) {
  return {
    initial: multiplier > 0 ? { height: 0, opacity: 0 } : (false as const),
    animate: {
      height: 'auto' as const,
      opacity: 1,
      transitionEnd: { overflow: 'visible' as const },
    },
    exit: multiplier > 0 ? { height: 0, opacity: 0, overflow: 'hidden' as const } : undefined,
    transition: { duration: duration * multiplier, ease: MOTION_EASING.standard },
  };
}
