import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  m as motion,
  animate,
  useIsPresent,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { hapticMedium } from '../../utils/haptic';
import type { Card, Grade, Occlusion } from '@lacuna/core/db/types';
import { speedMultiplier, type MotionSpeed } from '../../state/motionSpeed';
import type { AnswerStrictness } from '../../state/answerStrictness';
import { cn } from '../../components/ui/cn';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import type { LearnModeType, Phase } from './types';
import { isAudioCardFront } from '../../media/audio';
import { StudyCardFace } from './StudyCardFace';
import type { TypedAnswerJudgement } from '../../components/markdown/typedAnswerFeedback';
import { CardSizeMeasurements, useStableCardHeight } from './useStableCardHeight';
import { scaledSpring } from '../../components/ui/motion';
import { StudyCardMotionContext } from './studyCardMotion';

// One quiet surface in every mode and phase: no outline and no tinted halo.
const CARD_SURFACE_CLASS =
  'border-transparent shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]';

/**
 * A card that flips vertically to reveal its answer, and responds to touch and mouse
 * gestures: tap to flip, swipe left for No, swipe right for Yes. The swipe interaction
 * follows the finger directly, with a compact outcome cue. Accepted swipes retain
 * their direction and leave the viewport before handing over to the next card.
 */
export function FlipCard({
  card,
  promptId,
  revealed,
  motionSpeed,
  motionMultiplier,
  phase,
  isTouchMode = false,
  menuOpen,
  editing,
  hintsOpen,
  onReveal,
  onHide,
  allowGradingGestures = true,
  onAnswer,
  typedAnswer,
  typedJudgement,
  isTypingCard,
  mode: _mode,
  isLinesModeCard,
  hintStep,
  onRevealHint,
  hintAffectsScheduling,
  answerStrictness,
  occlusion,
  occlusionAnswerText,
}: {
  card: Card;
  /** A recognition prompt has the ordinary card surface but no reveal action. */
  promptId?: string;
  revealed: boolean;
  motionSpeed: MotionSpeed;
  motionMultiplier?: number;
  phase: Phase;
  isTouchMode?: boolean;
  menuOpen: boolean;
  editing: boolean;
  hintsOpen: boolean;
  onReveal: () => void;
  onHide: () => void;
  allowGradingGestures?: boolean;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard', velocity?: number) => void;
  typedAnswer?: string;
  typedJudgement?: TypedAnswerJudgement;
  isTypingCard?: boolean;
  mode: LearnModeType;
  isLinesModeCard?: boolean;
  hintStep?: 0 | 1 | 2;
  onRevealHint?: () => void;
  hintAffectsScheduling?: boolean;
  answerStrictness: AnswerStrictness;
  /** The owning Occlusion for an occlusion-generated card, resolved by useLearnSession. */
  occlusion?: Occlusion;
  /** The resolved typed-mode answer for an occlusion-generated card (§6.5); undefined
   *  when typed mode is not offered for it. */
  occlusionAnswerText?: string;
}) {
  const m = motionMultiplier ?? speedMultiplier(motionSpeed);
  const isTyping = Boolean(isTypingCard);
  const promptOnly = promptId !== undefined;
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null);
  const audioCard = isAudioCardFront(card.front);
  const [showAudioFront, setShowAudioFront] = useState(false);
  const swipeRef = useRef({
    x: 0,
    startX: 0,
    startY: 0,
    startOffset: 0,
    pointerId: 0,
    dragging: false,
    axis: null as 'x' | 'y' | null,
  });
  const selectionLenRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeThreshold = 60;
  const isPresent = useIsPresent();
  const committed = useRef(false);

  const replayAudio = useCallback(() => {
    if (!audioCard || phase !== 'answer') return;
    if (!showAudioFront) {
      setShowAudioFront(true);
      return;
    }
    const player = containerRef.current?.querySelector('audio');
    if (player) {
      player.currentTime = 0;
      void player.play().catch(() => {});
    }
  }, [audioCard, phase, showAudioFront]);

  const activateFace = useCallback(() => {
    if (phase === 'question') onReveal();
    else if (phase === 'answer') {
      // In Touch Mode the answer face is the way back to the question. The replay
      // control can still show the audio face without leaving the answer phase.
      if (audioCard && (!isTouchMode || showAudioFront)) setShowAudioFront((visible) => !visible);
      else onHide();
    }
  }, [phase, audioCard, isTouchMode, showAudioFront, onReveal, onHide]);

  useEffect(() => setShowAudioFront(false), [card.id]);

  useEffect(() => {
    const onReplayKey = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== 'r' || !audioCard || phase !== 'answer')
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      if (menuOpen || editing || hintsOpen) return;
      event.preventDefault();
      replayAudio();
    };
    window.addEventListener('keydown', onReplayKey);
    return () => window.removeEventListener('keydown', onReplayKey);
  }, [audioCard, phase, menuOpen, editing, hintsOpen, replayAudio]);

  // Follow the pointer without spring lag; only an abandoned swipe springs back.
  const localX = useMotionValue(0);
  const sharedX = useContext(StudyCardMotionContext);
  const swipeXMotion = sharedX ?? localX;
  // Motion owns the continuous drag. React only changes which cue is shown.
  const swipeOpacity = useTransform(swipeXMotion, (offset) =>
    Math.min(1, Math.abs(offset) / swipeThreshold),
  );
  const resetSwipe = useCallback(() => {
    if (m === 0) swipeXMotion.jump(0);
    // Critically damped like the study controls' springs: snappy, settling without bounce.
    else animate(swipeXMotion, 0, scaledSpring(m, 480, 2 * Math.sqrt(480)));
    setSwipeHint(null);
  }, [m, swipeXMotion]);
  useEffect(() => () => swipeXMotion.stop(), [swipeXMotion]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button > 0 || swipeRef.current.dragging || committed.current || !isPresent) return;
      if ((e.target as Element).closest('audio, button, input, textarea, a')) return;
      // Ignore swipes when any overlay is open.
      if (menuOpen || editing || hintsOpen) return;
      swipeXMotion.stop();
      swipeRef.current = {
        x: swipeXMotion.get(),
        startOffset: swipeXMotion.get(),
        startX: e.clientX,
        startY: e.clientY,
        dragging: true,
        pointerId: e.pointerId,
        axis: null,
      };
      selectionLenRef.current = window.getSelection()?.toString().length ?? 0;
      containerRef.current?.setPointerCapture?.(e.pointerId);
      setSwipeHint(null);
    },
    [menuOpen, editing, hintsOpen, isPresent, swipeXMotion],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeRef.current.dragging || e.pointerId !== swipeRef.current.pointerId) return;
      const dx = e.clientX - swipeRef.current.startX;
      const dy = e.clientY - swipeRef.current.startY;
      // Decide whether this is a horizontal swipe or a vertical scroll.
      // Swipe-to-grade is only enabled during the answer phase, matching keyboard shortcuts.
      if (!swipeRef.current.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        swipeRef.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (!allowGradingGestures || swipeRef.current.axis !== 'x' || phase !== 'answer') return;
      const offset = swipeRef.current.startOffset + dx;
      swipeRef.current.x = offset;
      swipeXMotion.set(offset);
      const hint: 'left' | 'right' | null =
        offset < -swipeThreshold / 2 ? 'left' : offset > swipeThreshold / 2 ? 'right' : null;
      setSwipeHint(hint);
    },
    [allowGradingGestures, phase, swipeXMotion],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeRef.current.dragging || e.pointerId !== swipeRef.current.pointerId) return;
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      swipeRef.current.dragging = false;
      const dx = swipeRef.current.x;
      const axis = swipeRef.current.axis;
      swipeRef.current.axis = null;
      const velocity = swipeXMotion.getVelocity();
      if (axis) {
        const flick = Math.abs(dx) > 12 && Math.abs(velocity) > 650 && dx * velocity > 0;
        if (
          allowGradingGestures &&
          axis === 'x' &&
          (Math.abs(dx) > swipeThreshold || flick) &&
          phase === 'answer'
        ) {
          committed.current = true;
          hapticMedium();
          // The shared transition carries swipe, button and keyboard grades off-screen.
          void onAnswer(dx > 0, 'touch', velocity);
        } else {
          resetSwipe();
        }
      } else {
        // It was a tap/click — flip the card unless the user selected text.
        const selection = window.getSelection();
        const selectionNow = selection?.toString().length ?? 0;
        const selectionGrew = selectionNow > selectionLenRef.current;
        const isInsideCard =
          selection && containerRef.current
            ? containerRef.current.contains(selection.anchorNode)
            : false;
        resetSwipe();
        if (!selectionGrew || !isInsideCard) activateFace();
      }
    },
    [allowGradingGestures, phase, activateFace, onAnswer, resetSwipe, swipeXMotion],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (committed.current || e.pointerId !== swipeRef.current.pointerId) return;
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      swipeRef.current.dragging = false;
      swipeRef.current.axis = null;
      resetSwipe();
    },
    [resetSwipe],
  );

  // Safety net: clear any lingering swipe state when the card flips back to question.
  useEffect(() => {
    if (phase === 'question' && isPresent) {
      committed.current = false;
      setShowAudioFront(false);
      swipeXMotion.jump(0);
      setSwipeHint(null);
    }
  }, [phase, isPresent, swipeXMotion]);

  const displayedFront = !revealed || showAudioFront;
  const surfaceClassName =
    'study-card-surface flex min-h-[12rem] flex-col items-center justify-center rounded-3xl border bg-surface px-6 py-10 md:min-h-[14rem] md:px-12 md:py-14';

  const { height: stableHeight, frontRef, backRef } = useStableCardHeight();
  const face = (side: 'front' | 'back', measuring = false) => (
    <StudyCardFace
      card={card}
      side={side}
      promptId={side === 'front' && !measuring ? promptId : undefined}
      audioCard={audioCard}
      audioAutoplay={audioCard && side === 'front'}
      isLinesModeCard={isLinesModeCard}
      hintStep={hintStep}
      hintAffectsScheduling={hintAffectsScheduling}
      isTyping={isTyping}
      typedAnswer={typedAnswer}
      typedJudgement={typedJudgement}
      answerStrictness={answerStrictness}
      occlusion={occlusion}
      occlusionAnswerText={occlusionAnswerText}
      motionMultiplier={m}
      measuring={measuring}
      onReplayAudio={replayAudio}
      onRevealHint={() => onRevealHint?.()}
    />
  );

  return (
    <div
      className="study-flip-card flex flex-1 items-center justify-center"
      style={{ perspective: '1600px' }}
    >
      <div
        ref={containerRef}
        role={promptOnly ? undefined : 'button'}
        data-study-reveal-only={!promptOnly && !allowGradingGestures ? true : undefined}
        tabIndex={promptOnly ? undefined : 0}
        aria-label={
          promptOnly
            ? undefined
            : displayedFront
              ? revealed
                ? 'Show answer again'
                : 'Show answer'
              : 'Hide answer'
        }
        className={cn('relative w-full', !promptOnly && 'cursor-pointer')}
        style={{ transformStyle: 'preserve-3d', touchAction: 'pan-y' }}
        onPointerDown={promptOnly ? undefined : handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || promptOnly || committed.current || !isPresent)
            return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          activateFace();
        }}
      >
        <CardSizeMeasurements
          front={face('front', true)}
          back={face('back', true)}
          surfaceClassName={surfaceClassName}
          frontRef={frontRef}
          backRef={backRef}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={displayedFront ? 'front' : 'back'}
            initial={m > 0 ? { rotateX: -92, opacity: 0, scale: 0.97 } : false}
            animate={m > 0 ? { rotateX: 0, opacity: 1, scale: 1 } : undefined}
            exit={m > 0 ? { rotateX: 92, opacity: 0, scale: 0.97 } : undefined}
            transition={{
              duration: 0.28 * m,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              transformOrigin: 'center center',
              x: sharedX ? undefined : swipeXMotion,
              height: stableHeight,
              minHeight:
                stableHeight === undefined
                  ? undefined
                  : `min(${stableHeight}px, var(--study-card-max-height, ${stableHeight}px))`,
            }}
            className={cn('relative z-10 ' + surfaceClassName, CARD_SURFACE_CLASS)}
          >
            {/* Keep drag feedback attached to the card throughout the throw. */}
            {swipeHint && (
              <motion.div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute top-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                  swipeHint === 'right'
                    ? 'left-4 bg-positive/10 text-positive'
                    : 'right-4 bg-negative/10 text-negative',
                )}
                style={{ opacity: swipeOpacity }}
              >
                {swipeHint === 'right' ? (
                  <CheckIcon width={14} height={14} />
                ) : (
                  <CloseIcon width={14} height={14} />
                )}
                {swipeHint === 'right' ? 'Yes' : 'No'}
              </motion.div>
            )}
            {face(displayedFront ? 'front' : 'back')}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
