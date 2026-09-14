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
  dismiss: (correct: boolean, commit: () => void, source?: 'touch' | 'keyboard') => void;
  cancel: () => void;
}

const resting = 'translateX(0px) translateY(0px) scale(1)';
const entering = 'translateX(0px) translateY(20px) scale(0.97)';
const DEPARTURE_DURATION_SECONDS = 0.2;
const INTER_CARD_PAUSE_MS = 180;
const FEEDBACK_DURATION_SECONDS = 0.32;
const ENTRANCE_DURATION_SECONDS = 0.36;

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
  const feedbackOpacity = useMotionValue(0);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    source: 'touch' | 'keyboard';
  } | null>(null);
  const busy = useRef(false);
  const commitTimer = useRef<number | null>(null);
  const [departing, setDeparting] = useState(false);
  const previousCard = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (previousCard.current === cardId && !(busy.current && phase === 'question')) return;
    previousCard.current = cardId;
    busy.current = false;
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = null;
    feedbackOpacity.jump(0);
    setFeedback(null);
    setDeparting(false);
    transform.jump(multiplier > 0 ? entering : resting);
    opacity.jump(multiplier > 0 ? 0 : 1);
    if (multiplier > 0) {
      animate(transform, resting, {
        duration: ENTRANCE_DURATION_SECONDS * multiplier,
        ease: [0.16, 1, 0.3, 1],
      });
      animate(opacity, 1, { duration: 0.18 * multiplier });
    }
  }, [cardId, phase, multiplier, transform, opacity, feedbackOpacity]);

  useLayoutEffect(
    () => () => {
      transform.stop();
      opacity.stop();
      feedbackOpacity.stop();
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      // StrictMode replays setup after cleanup; its replacement entrance must restart.
      previousCard.current = null;
    },
    [transform, opacity, feedbackOpacity],
  );

  useImperativeHandle(
    ref,
    () => ({
      cancel() {
        if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
        commitTimer.current = null;
        busy.current = false;
        transform.jump(resting);
        opacity.jump(1);
        feedbackOpacity.jump(0);
        setFeedback(null);
        setDeparting(false);
      },
      dismiss(correct, commit, source = 'keyboard') {
        if (busy.current) return;
        busy.current = true;
        setDeparting(true);
        if (multiplier === 0 || !element.current) {
          commit();
          return;
        }
        setFeedback({ correct, source });
        animate(feedbackOpacity, [0, 1, 0], {
          duration: FEEDBACK_DURATION_SECONDS * multiplier,
          times: [0, 0.35, 1],
          ease: 'easeInOut',
        });
        const bounds = element.current.getBoundingClientRect();
        const target = correct ? window.innerWidth - bounds.left + 32 : -bounds.right - 32;
        opacity.jump(1);
        animate(transform, `translateX(${target}px) translateY(0px) scale(1)`, {
          duration: DEPARTURE_DURATION_SECONDS * multiplier,
          ease: [0.32, 0, 0.67, 0],
          onComplete: () => {
            commitTimer.current = window.setTimeout(() => {
              commitTimer.current = null;
              // Finish the pulse before persistence can render another card.
              feedbackOpacity.jump(0);
              setFeedback(null);
              commit();
            }, INTER_CARD_PAUSE_MS * multiplier);
          },
        });
      },
    }),
    [multiplier, transform, opacity, feedbackOpacity],
  );

  return (
    <>
      {feedback && (
        <motion.div
          aria-hidden
          data-study-feedback={feedback.correct ? 'right' : 'left'}
          style={{ opacity: feedbackOpacity }}
          className={
            'pointer-events-none fixed z-30 ' +
            (feedback.source === 'touch'
              ? 'inset-y-0 w-56 ' +
                (feedback.correct
                  ? 'right-0 bg-gradient-to-l from-positive/25 to-transparent'
                  : 'left-0 bg-gradient-to-r from-negative/20 to-transparent')
              : 'inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent ' +
                (feedback.correct ? 'from-positive/25' : 'from-negative/20'))
          }
        />
      )}
      <motion.div
        ref={element}
        data-study-card-id={cardId}
        className="w-full"
        style={{ transform, opacity, pointerEvents: departing ? 'none' : undefined }}
      >
        {children}
      </motion.div>
    </>
  );
});
