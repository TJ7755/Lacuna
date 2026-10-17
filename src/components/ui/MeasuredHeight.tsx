import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from './motion';

/** Measures the incoming in-flow step; StepSwap keeps departing steps absolute. */
export function MeasuredHeight({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    // Layout height, not the transformed bounding box: an ancestor mid-scale would shrink it.
    setHeight(element.offsetHeight);
    const observer = new ResizeObserver((entries) => {
      setHeight(entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div
      initial={false}
      animate={{
        height: multiplier > 0 ? (height ?? 'auto') : 'auto',
        overflow: 'hidden',
        transitionEnd: { overflow: 'visible' },
      }}
      transition={expandingActionSpring(multiplier)}
      className="overflow-hidden"
    >
      <div ref={content} className="flow-root">
        {children}
      </div>
    </motion.div>
  );
}
