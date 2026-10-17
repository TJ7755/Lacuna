export function studyCardExitTransition(
  multiplier: number,
  from: number,
  to: number,
  velocity: number,
) {
  const distance = Math.abs(to - from);
  if (multiplier === 0 || distance < 1) return { duration: 0 } as const;

  const restingDuration = 0.56 * multiplier;
  const minimumDuration = 0.36 * multiplier;
  const speedLimit = Math.min(2400, (1.6 * distance) / minimumDuration);
  const release = Math.max(-speedLimit, Math.min(speedLimit, velocity * Math.sign(to - from)));
  const duration = Math.max(
    minimumDuration,
    restingDuration / (1 + (Math.max(0, release) * restingDuration) / (2 * distance)),
  );
  const initialSlope = (release * duration) / distance;

  // This is the constant-acceleration trajectory
  // x(t) = v*t + (distance - v*duration)*(t/duration)^2. Its initial speed
  // matches the finger; from rest it eases in rather than launching at peak speed.
  return {
    type: 'tween' as const,
    duration,
    ease: (progress: number) => initialSlope * progress + (1 - initialSlope) * progress ** 2,
  };
}
