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
    transition: { duration: duration * multiplier, ease: [0.16, 1, 0.3, 1] as const },
  };
}
