import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  animate,
  AnimatePresence,
  cancelFrame,
  frame,
  m as motion,
  useMotionValue,
  usePresence,
  useTransform,
} from 'motion/react';
import { MOTION_EASING } from '../../components/ui/motion';
import type { Phase } from './types';
import { StudyCardMotionContext } from './studyCardMotion';
import { studyCardExitTransition } from './studyCardExit';

interface Departure {
  correct: boolean;
  x: number;
  velocity: number;
  source: 'touch' | 'keyboard';
}

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
  const [departure, setDeparture] = useState<Departure | null>(null);

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
    dismiss(correct, commit, source = 'keyboard', velocity = 0) {
      if (busy.current) return false;
      busy.current = true;
      if (m === 0 || !element.current) {
        commit();
        return true;
      }
      const bounds = element.current.parentElement!.getBoundingClientRect();
      const clearance = 32 + element.current.offsetHeight * 0.08;
      setDeparture({
        correct,
        // The grid stays at the resting position while its card is being dragged.
        // Aim just beyond the viewport, allowing clearance for rotated corners.
        x: correct ? window.innerWidth - bounds.left + clearance : -bounds.right - clearance,
        velocity,
        source,
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

  return (
    <div className="relative grid w-full">
      <AnimatePresence key={reset} initial={false} mode="popLayout">
        <StudyCardPresentation
          key={`${cardId}:${presentation.serial}`}
          ref={(node) => {
            // Presence unmounts the old node after the new one has claimed this ref.
            if (node && !departure) element.current = node;
          }}
          data-study-card-id={cardId}
          departure={departure}
          m={m}
        >
          {children}
        </StudyCardPresentation>
      </AnimatePresence>
    </div>
  );
});

const StudyCardPresentation = forwardRef<
  HTMLDivElement,
  { 'data-study-card-id': string; departure: Departure | null; m: number; children: ReactNode }
>(function StudyCardPresentation({ departure, m, children, ...attributes }, ref) {
  const node = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, (offset) => offset / 160);
  const opacity = useTransform(x, (offset) =>
    departure ? Math.max(0, 1 - (offset / departure.x) ** 4) : 1,
  );
  const [present, safeToRemove] = usePresence();
  const flight = useRef<ReturnType<typeof animate> | null>(null);

  useLayoutEffect(() => {
    if (!departure) return;
    // Start on acceptance, not after the database has supplied the next card.
    // The same value already contains the drag offset, so release never changes owners.
    if (!node.current) return;
    const from = x.get();
    const transition = studyCardExitTransition(
      m,
      from,
      departure.x,
      departure.velocity,
      departure.source,
    );
    const startOpacity = Math.max(0, 1 - (from / departure.x) ** 4);
    const progress = transition.ease ?? ((value: number) => value);
    // Animate the complete transform so the browser can composite the flight even
    // while mounting the next card occupies the main thread.
    const animation = animate(
      node.current,
      {
        transform: [
          `translateX(${from}px) rotate(${from / 160}deg)`,
          `translateX(${departure.x}px) rotate(${departure.x / 160}deg)`,
        ],
        opacity: [startOpacity, 0],
      },
      {
        transform: transition,
        opacity: {
          duration: transition.duration,
          ease: (time: number) => {
            const offset = from + (departure.x - from) * progress(time);
            const remaining = Math.max(0, 1 - (offset / departure.x) ** 4);
            return startOpacity === 0 ? 1 : 1 - remaining / startOpacity;
          },
        },
      },
    );
    flight.current = animation;
    return () => animation.stop();
  }, [departure, m, x]);

  useLayoutEffect(() => {
    if (present) return;
    let cancelled = false;
    const remove = () => {
      if (!cancelled) safeToRemove?.();
    };
    if (flight.current)
      void flight.current.then(() => {
        // Completion can remove the card in its final frame, before that frame
        // is presented. Retain the endpoint through Motion's next render pass.
        if (!cancelled) frame.postRender(remove);
      });
    else safeToRemove?.();
    return () => {
      cancelled = true;
      cancelFrame(remove);
    };
  }, [present, safeToRemove]);

  return (
    <StudyCardMotionContext.Provider value={x}>
      <motion.div
        {...attributes}
        ref={(element) => {
          node.current = element;
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }}
        className="relative col-start-1 row-start-1 w-full self-center"
        inert={departure !== null || !present}
        aria-hidden={departure !== null || !present || undefined}
        style={{
          x,
          rotate,
          opacity,
          zIndex: departure ? 1 : 0,
          pointerEvents: departure ? 'none' : undefined,
        }}
      >
        <motion.div
          initial={{ y: 12, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ duration: 0.28 * m, ease: MOTION_EASING.standard }}
        >
          {children}
          {departure && <StudyGradeRim correct={departure.correct} m={m} />}
        </motion.div>
      </motion.div>
    </StudyCardMotionContext.Provider>
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
