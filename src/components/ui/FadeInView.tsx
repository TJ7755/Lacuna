import { m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

interface FadeInViewProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  x?: number;
  scale?: number;
  once?: boolean;
}

/**
 * Scroll-triggered reveal wrapper. Uses motion/react's whileInView to detect when
 * the element enters the viewport, then animates it in. Respects the global
 * motion-speed setting and reduced-motion preferences.
 */
export function FadeInView({
  children,
  className,
  delay = 0,
  duration = 0.28,
  y = 16,
  x = 0,
  scale = 1,
  once = true,
}: FadeInViewProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const initial: Record<string, number> = { opacity: 0 };
  if (y !== 0) initial.y = y;
  if (x !== 0) initial.x = x;
  if (scale !== 1) initial.scale = scale;

  const animate: Record<string, number> = { opacity: 1 };
  if (y !== 0) animate.y = 0;
  if (x !== 0) animate.x = 0;
  if (scale !== 1) animate.scale = 1;

  return (
    <motion.div
      initial={initial}
      whileInView={animate}
      viewport={{ once, amount: 0, margin: '0px 0px 100px 0px' }}
      transition={{
        duration: duration * m,
        delay: delay * m,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
