import { useEffect, useMemo } from 'react';
import { m as motion, animate, useMotionValue, useTransform } from 'motion/react';
import { MOTION_EASING } from './motion';

const PIECE_COLOURS = [
  'hsl(var(--accent))',
  'hsl(var(--positive))',
  'hsl(var(--warning))',
  'hsl(var(--ink))',
];

interface Piece {
  x: number;
  y: number;
  fall: number;
  rotate: number;
  size: number;
  shape: 'dot' | 'square' | 'bar';
  colour: string;
  delay: number;
}

/** Deterministic scatter so a burst looks the same in tests and on every replay. */
export function burstPieces(count: number, spread: number, seed = 1): Piece[] {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + random() * 0.6;
    const distance = spread * (0.45 + random() * 0.55);
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.75 - spread * 0.25,
      fall: spread * (0.35 + random() * 0.4),
      rotate: (random() - 0.5) * 540,
      size: 5 + Math.round(random() * 5),
      shape: (['dot', 'square', 'bar'] as const)[index % 3],
      colour: PIECE_COLOURS[index % PIECE_COLOURS.length],
      delay: random() * 0.06,
    };
  });
}

/**
 * A short, decorative confetti burst centred on its parent. It renders nothing when
 * motion is off, never takes pointer input, and is hidden from assistive technology.
 * Change `trigger` to fire it again.
 */
export function Burst({
  trigger,
  multiplier,
  count = 18,
  spread = 90,
}: {
  trigger: number | string;
  multiplier: number;
  count?: number;
  spread?: number;
}) {
  const pieces = useMemo(() => burstPieces(count, spread, String(trigger).length + count), [
    count,
    spread,
    trigger,
  ]);
  if (multiplier === 0) return null;
  return (
    <span
      aria-hidden="true"
      data-burst
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0"
    >
      {pieces.map((piece, index) => (
        <motion.span
          key={`${trigger}-${index}`}
          className="absolute"
          style={{
            width: piece.shape === 'bar' ? piece.size * 0.5 : piece.size,
            height: piece.shape === 'bar' ? piece.size * 1.8 : piece.size,
            marginLeft: -piece.size / 2,
            marginTop: -piece.size / 2,
            borderRadius: piece.shape === 'dot' ? '50%' : 2,
            background: piece.colour,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{
            x: [0, piece.x, piece.x * 1.08],
            y: [0, piece.y, piece.y + piece.fall],
            opacity: [1, 1, 0],
            scale: [0.4, 1, 0.8],
            rotate: piece.rotate,
          }}
          transition={{
            duration: 0.95 * multiplier,
            delay: piece.delay * multiplier,
            times: [0, 0.45, 1],
            ease: MOTION_EASING.emphasised,
          }}
        />
      ))}
    </span>
  );
}

/** Counts from `from` to `value` once on mount and whenever `value` changes. */
export function CountUp({
  value,
  from = 0,
  multiplier,
  duration = 0.9,
  format = (n: number) => String(Math.round(n)),
}: {
  value: number;
  from?: number;
  multiplier: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const motionValue = useMotionValue(multiplier > 0 ? from : value);
  const text = useTransform(motionValue, format);
  useEffect(() => {
    if (multiplier === 0) {
      motionValue.jump(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: duration * multiplier,
      ease: MOTION_EASING.emphasised,
    });
    return () => controls.stop();
  }, [value, multiplier, duration, motionValue]);
  // Screen readers get the final figure, not every intermediate frame.
  return (
    <>
      <motion.span aria-hidden="true">{text}</motion.span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
