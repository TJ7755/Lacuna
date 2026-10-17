import { expandingActionSpring } from './motion';

export interface MorphRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function morphTiming(open: boolean, multiplier: number) {
  return {
    duration: (open ? 420 : 300) * multiplier,
    xDelay: (open ? 0 : 35) * multiplier,
    yDelay: (open ? 35 : 0) * multiplier,
  };
}

/** The axes share a damping ratio, but the softer vertical spring follows the width. */
export function morphProgress(time: number, open: boolean, axis: 'x' | 'y') {
  if (time <= 0) return 0;
  const spring = expandingActionSpring(1, open ? 'open' : 'close', axis);
  if (!('stiffness' in spring)) return 1;
  const omega = Math.sqrt(spring.stiffness);
  const ratio = spring.damping / (2 * omega);
  const seconds = time / 1000;
  if (ratio >= 1) return 1 - (1 + omega * seconds) * Math.exp(-omega * seconds);
  const damped = omega * Math.sqrt(1 - ratio ** 2);
  return (
    1 -
    Math.exp(-ratio * omega * seconds) *
      (Math.cos(damped * seconds) + ((ratio * omega) / damped) * Math.sin(damped * seconds))
  );
}

export function morphFrame(
  origin: MorphRect,
  panel: MorphRect,
  x: number,
  y: number,
  finalRadius = 24,
  initialRadius = origin.height,
) {
  const width = origin.width + (panel.width - origin.width) * x;
  const height = origin.height + (panel.height - origin.height) * y;
  const left = (origin.left - panel.left) * (1 - x);
  const top = (origin.top - panel.top) * (1 - y);
  // Keep the capsule ends circular until there is enough height to relax the corner.
  const radius = Math.max(
    0,
    Math.min(height / 2, initialRadius + (finalRadius - initialRadius) * y),
  );
  const px = (value: number) => `${Math.round(value * 1000) / 1000}px`;
  return {
    width,
    height,
    radius,
    left,
    top,
    clipPath: `inset(${px(top)} ${px(panel.width - left - width)} ${px(panel.height - top - height)} ${px(left)} round ${px(radius)})`,
  };
}

export function morphKeyframes(
  origin: MorphRect,
  panel: MorphRect,
  open: boolean,
  multiplier: number,
  from = { x: +!open, y: +!open },
  finalRadius = 24,
  initialRadius = origin.height,
  elapsed = 0,
) {
  const timing = morphTiming(open, multiplier);
  const target = +open;
  if (multiplier === 0)
    return {
      duration: 0,
      frames: [
        { ...morphFrame(origin, panel, target, target, finalRadius, initialRadius), offset: 1 },
      ].map(({ clipPath, offset }) => ({ clipPath, offset })),
      sample: () => ({ x: target, y: target }),
    };
  const duration = Math.max(0, timing.duration - elapsed);
  const axisProgress = (time: number, axis: 'x' | 'y') => {
    const delay = axis === 'x' ? timing.xDelay : timing.yDelay;
    const value = morphProgress((time + elapsed - delay) / multiplier, open, axis);
    if (elapsed === 0) return value;
    const start = morphProgress((elapsed - delay) / multiplier, open, axis);
    if (start >= 0.98) return Math.min(1, time / Math.max(1, duration));
    return Math.min(1, Math.max(0, (value - start) / (1 - start)));
  };
  const sample = (time: number) => ({
    x: from.x + (target - from.x) * axisProgress(time, 'x'),
    y: from.y + (target - from.y) * axisProgress(time, 'y'),
  });
  // Pre-sample once; native playback does not write layout or run React on each frame.
  const count = Math.max(1, Math.ceil(duration / (1000 / 120)));
  const frames = Array.from({ length: count + 1 }, (_, index) => {
    const offset = index / count;
    const { x, y } = index === count ? { x: target, y: target } : sample(offset * duration);
    return {
      clipPath: morphFrame(origin, panel, x, y, finalRadius, initialRadius).clipPath,
      offset,
    };
  });
  return { duration, frames, sample };
}

/** Always consume cancellation at the owner, including unmount and rapid reversal. */
export function animationFinished(animation: Animation, complete?: () => void) {
  void animation.finished.then(complete, (error: unknown) => {
    if (!(error instanceof Error) || error.name !== 'AbortError') console.error(error);
  });
}
