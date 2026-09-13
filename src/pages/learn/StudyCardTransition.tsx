import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { animate, m as motion, useMotionValue } from 'motion/react';
import type { Phase } from './types';

export interface StudyCardTransitionHandle {
  dismiss: (correct: boolean, commit: () => void) => void;
}

const resting = 'translateX(0px) translateY(0px) scale(1)';
const entering = 'translateX(0px) translateY(20px) scale(0.97)';

/** Owns the hand-off for swipe, button and keyboard grades, including repeated cards. */
export const StudyCardTransition = forwardRef<
  StudyCardTransitionHandle,
  {
    cardId: string;
    phase: Phase;
    multiplier: number;
    children: ReactNode;
  }
>(function StudyCardTransition({ cardId, phase, multiplier, children }, ref) {
  const element = useRef<HTMLDivElement>(null);
  const transform = useMotionValue(multiplier > 0 ? entering : resting);
  const opacity = useMotionValue(multiplier > 0 ? 0 : 1);
  const busy = useRef(false);
  const [departing, setDeparting] = useState(false);
  const previousCard = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (previousCard.current === cardId && !(busy.current && phase === 'question')) return;
    previousCard.current = cardId;
    busy.current = false;
    setDeparting(false);
    transform.jump(multiplier > 0 ? entering : resting);
    opacity.jump(multiplier > 0 ? 0 : 1);
    if (multiplier > 0) {
      animate(transform, resting, { duration: 0.28 * multiplier, ease: [0.16, 1, 0.3, 1] });
      animate(opacity, 1, { duration: 0.14 * multiplier });
    }
  }, [cardId, phase, multiplier, transform, opacity]);

  useLayoutEffect(
    () => () => {
      transform.stop();
      opacity.stop();
      // StrictMode replays setup after cleanup; its replacement entrance must restart.
      previousCard.current = null;
    },
    [transform, opacity],
  );

  useImperativeHandle(
    ref,
    () => ({
      dismiss(correct, commit) {
        if (busy.current) return;
        busy.current = true;
        setDeparting(true);
        if (multiplier === 0 || !element.current) {
          commit();
          return;
        }
        const bounds = element.current.getBoundingClientRect();
        const target = correct ? window.innerWidth - bounds.left + 32 : -bounds.right - 32;
        opacity.jump(1);
        animate(transform, `translateX(${target}px) translateY(0px) scale(1)`, {
          duration: 0.2 * multiplier,
          ease: [0.32, 0, 0.67, 0],
          onComplete: commit,
        });
      },
    }),
    [multiplier, transform, opacity],
  );

  return (
    <motion.div
      ref={element}
      data-study-card-id={cardId}
      className="w-full"
      style={{ transform, opacity, pointerEvents: departing ? 'none' : undefined }}
    >
      {children}
    </motion.div>
  );
});
