import { useEffect, type ComponentProps } from 'react';
import { animate, m as motion, useAnimationControls, useMotionValue } from 'motion/react';
import type { Grade } from '../../db/types';
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
  const fillOpacity = useMotionValue(0);
  const active = feedback?.input === grade;
  useEffect(() => {
    if (!active || m === 0) {
      fillOpacity.jump(0);
      return;
    }
    const fill = animate(fillOpacity, [0, 0.3, 0], {
      duration: 0.24 * m,
      times: [0, 0.2, 1],
    });
    void controls.start({
      scale: [1, 0.97, 1],
      transition: { duration: 0.24 * m, times: [0, 0.18, 1] },
    });
    return () => {
      fill.stop();
      controls.stop();
    };
  }, [active, feedback?.serial, m, controls, fillOpacity]);
  const positive = typeof grade === 'boolean' ? grade : grade > 1;
  return (
    <motion.div className="relative flex w-full flex-1" animate={controls}>
      <Button
        {...props}
        data-study-grade-active={active || undefined}
        style={{ ...props.style, position: 'relative', overflow: 'hidden' }}
      >
        <motion.span
          aria-hidden
          data-study-grade-fill
          className={`pointer-events-none absolute inset-0 ${positive ? 'bg-positive' : 'bg-negative'}`}
          style={{ opacity: fillOpacity }}
        />
        {children}
      </Button>
    </motion.div>
  );
}
