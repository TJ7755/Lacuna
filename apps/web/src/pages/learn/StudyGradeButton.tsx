import { useEffect, useRef, type ComponentProps } from 'react';
import { m as motion, useAnimationControls } from 'motion/react';
import { animate } from 'motion/mini';
import type { Grade } from '@lacuna/core/db/types';
import { Button } from '../../components/ui/Button';

export interface StudyGradeFeedback {
  input: boolean | Grade;
  serial: number;
}

/** The same acknowledgement for pointer grades and the configured keyboard shortcuts. */
export function StudyGradeButton({
  grade,
  feedback,
  m,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  grade: boolean | Grade;
  feedback?: StudyGradeFeedback;
  m: number;
}) {
  const controls = useAnimationControls();
  const fillRef = useRef<HTMLSpanElement>(null);
  const active = feedback?.input === grade;
  useEffect(() => {
    const element = fillRef.current;
    if (!element) return;
    element.style.opacity = '0';
    if (!active || m === 0) return;
    const fill = animate(
      element,
      { opacity: [0, 0.3, 0] },
      {
        duration: 0.24 * m,
        times: [0, 0.2, 1],
        // Match the numeric animation's ease-out within each keyframe interval.
        ease: ['easeOut', 'easeOut'],
      },
    );
    void controls.start({
      scale: [1, 0.97, 1],
      transition: { duration: 0.24 * m, times: [0, 0.18, 1] },
    });
    return () => {
      fill.stop();
      element.style.opacity = '0';
      controls.stop();
    };
  }, [active, feedback?.serial, m, controls]);
  const positive = typeof grade === 'boolean' ? grade : grade > 1;
  return (
    <motion.div className="relative flex w-full flex-1" animate={controls}>
      <Button
        {...props}
        data-study-grade-active={active || undefined}
        style={{ ...props.style, position: 'relative', overflow: 'hidden' }}
      >
        <span
          ref={fillRef}
          aria-hidden
          data-study-grade-fill
          className={`pointer-events-none absolute inset-0 ${positive ? 'bg-positive' : 'bg-negative'}`}
          style={{ opacity: 0 }}
        />
        {children}
      </Button>
    </motion.div>
  );
}
