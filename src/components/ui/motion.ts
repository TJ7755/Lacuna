/** Scale a physics spring to the requested duration without changing its damping ratio. */
export function scaledSpring(multiplier: number, stiffness: number, damping: number) {
  if (multiplier === 0) return { duration: 0 } as const;
  return {
    type: 'spring' as const,
    stiffness: stiffness / multiplier ** 2,
    damping: damping / multiplier,
  };
}
