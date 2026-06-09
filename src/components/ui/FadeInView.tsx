import { useRef, useState, useEffect } from 'react';
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
  threshold?: number;
}

/**
 * Scroll-triggered reveal wrapper. Uses IntersectionObserver to detect when the
 * element enters the viewport, then animates it in with a motion.div. Respects the
 * global motion-speed setting and reduced-motion preferences.
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
  threshold = 0.1,
}: FadeInViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

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
      ref={ref}
      initial={initial}
      animate={animate}
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
