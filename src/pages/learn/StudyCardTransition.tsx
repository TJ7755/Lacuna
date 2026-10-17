import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { animate, AnimatePresence, m as motion, useMotionValue } from 'motion/react';
import { scaledSpring } from '../../components/ui/motion';
import type { Phase } from './types';

export interface StudyCardTransitionHandle {
  dismiss: (
    correct: boolean,
    commit: () => void,
    source?: 'touch' | 'keyboard',
    velocity?: number,
  ) => boolean;
  cancel: () => void;
}

/** Persistence chooses the next card; presence retains the old presentation during the write. */
export const StudyCardTransition = forwardRef<
  StudyCardTransitionHandle,
  { cardId: string; phase: Phase; multiplier: number; children: ReactNode }
>(function StudyCardTransition({ cardId, phase, multiplier: m, children }, ref) {
  const element = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const commitTimer = useRef<number | null>(null);
  const [presentation, setPresentation] = useState({ cardId, phase, serial: 0 });
  const [reset, setReset] = useState(0);
  const [departure, setDeparture] = useState<{
    correct: boolean;
    x: number;
    velocity: number;
  } | null>(null);

  // A repeated id is still a new presentation when grading returns to the question.
  // Adjust before React commits, so presence retains the previous answer and its props.
  if (cardId !== presentation.cardId || (busy.current && phase === 'question')) {
    setPresentation({ cardId, phase, serial: presentation.serial + 1 });
    setDeparture(null);
    busy.current = false;
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = null;
  } else if (phase !== presentation.phase) {
    setPresentation({ ...presentation, phase });
  }

  useLayoutEffect(
    () => () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    cancel() {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
      busy.current = false;
      setDeparture(null);
      // Undo also removes any retained outgoing presentation.
      setReset((value) => value + 1);
    },
    dismiss(correct, commit, _source = 'keyboard', velocity = 0) {
      if (busy.current) return false;
      busy.current = true;
      if (m === 0 || !element.current) {
        commit();
        return true;
      }
      const bounds = element.current.getBoundingClientRect();
      setDeparture({
        correct,
        x: correct ? window.innerWidth - bounds.left + 64 : -bounds.right - 64,
        velocity,
      });
      // Begin persistence while the card is still visible. No speculative queue read,
      // second commit, or empty inter-card pause; the incoming presentation overlaps.
      commitTimer.current = window.setTimeout(() => {
        commitTimer.current = null;
        commit();
      }, 70 * m);
      return true;
    },
  }));

  if (m === 0) {
    return (
      <div key={`${cardId}:${presentation.serial}`} data-study-card-id={cardId} className="w-full">
        {children}
      </div>
    );
  }

  const target = departure
    ? { x: departure.x, y: -6, scale: 1.02, rotate: departure.correct ? 3 : -3, opacity: 1 }
    : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  const spring = scaledSpring(m, 300, 35);
  const transition = {
    ...spring,
    scale: scaledSpring(m, 650, 51),
    opacity: { duration: 0.16 * m },
  };

  return (
    <div className="relative grid w-full">
      <AnimatePresence key={reset} initial={false} mode="popLayout">
        <motion.div
          key={`${cardId}:${presentation.serial}`}
          ref={(node) => {
            // Presence unmounts the old node after the new one has claimed this ref.
            if (node && !departure) element.current = node;
          }}
          data-study-card-id={cardId}
          className="relative col-start-1 row-start-1 w-full self-center"
          initial={m > 0 ? { y: 12, scale: 0.96, opacity: 0.65 } : false}
          animate={{ ...target, x: 0 }}
          exit={
            departure
              ? {
                  ...target,
                  transition: {
                    ...transition,
                    x: { ...spring, velocity: departure.velocity / m },
                  },
                }
              : { opacity: 0 }
          }
          transition={transition}
          inert={departure !== null}
          aria-hidden={departure !== null || undefined}
          style={{ zIndex: departure ? 1 : 0, pointerEvents: departure ? 'none' : undefined }}
        >
          {children}
          {departure && <StudyGradeRim correct={departure.correct} m={m} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

/** A new rim must animate even inside the first presentation's initial=false context. */
function StudyGradeRim({ correct, m }: { correct: boolean; m: number }) {
  const opacity = useMotionValue(0);
  useLayoutEffect(() => {
    const animation = animate(opacity, [0, 1, 0], {
      duration: 0.32 * m,
      times: [0, 0.2, 1],
    });
    return () => animation.stop();
  }, [m, opacity]);
  const colour = correct ? 'positive' : 'negative';
  return (
    <motion.div
      aria-hidden
      data-study-rim={colour}
      className="pointer-events-none absolute inset-0 rounded-3xl"
      style={{
        opacity,
        boxShadow: `inset 0 0 0 2px hsl(var(--${colour}) / 0.65), inset 0 0 20px hsl(var(--${colour}) / 0.16)`,
      }}
    />
  );
}
