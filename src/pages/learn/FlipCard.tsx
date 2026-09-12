import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, animate, useIsPresent, useMotionValue } from 'motion/react';
import { hapticMedium } from '../../utils/haptic';
import type { Card, Grade, Occlusion } from '../../db/types';
import { speedMultiplier, type MotionSpeed } from '../../state/motionSpeed';
import type { AnswerStrictness } from '../../state/answerStrictness';
import { cn } from '../../components/ui/cn';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import type { LearnModeType, Phase } from './types';
import { isAudioCardFront } from '../../media/audio';
import { StudyCardFace } from './StudyCardFace';
import { CardSizeMeasurements, useStableCardHeight } from './useStableCardHeight';

function modeBorderClass(mode: LearnModeType, revealed: boolean): string {
  if (!revealed) return 'border-line shadow-xl shadow-black/5';
  switch (mode) {
    case 'cram':
      return 'border-warning/40 shadow-2xl shadow-warning/10';
    case 'simple':
      return 'border-positive/40 shadow-2xl shadow-positive/10';
    case 'filtered-leech':
      return 'border-negative/40 shadow-2xl shadow-negative/10';
    case 'filtered-flagged':
      return 'border-warning/40 shadow-2xl shadow-warning/10';
    case 'filtered':
      return 'border-accent/40 shadow-2xl shadow-accent/10';
    default:
      return 'border-accent/40 shadow-2xl shadow-accent/10';
  }
}

/**
 * A card that flips vertically to reveal its answer, and responds to touch and mouse
 * gestures: tap to flip, swipe left for No, swipe right for Yes. The swipe interaction
 * follows the finger directly, with a compact outcome cue. Accepted swipes retain
 * their direction and leave the viewport before handing over to the next card.
 */
export function FlipCard({
  card,
  revealed,
  motionSpeed,
  phase,
  isTouchMode,
  menuOpen,
  editing,
  navOpen,
  hintsOpen,
  onReveal,
  onHide,
  onAnswer,
  typedAnswer,
  isTypingCard,
  mode,
  isLinesModeCard,
  hintStep,
  onRevealHint,
  hintAffectsScheduling,
  answerStrictness,
  occlusion,
  occlusionAnswerText,
}: {
  card: Card;
  revealed: boolean;
  motionSpeed: MotionSpeed;
  phase: Phase;
  isTouchMode: boolean;
  menuOpen: boolean;
  editing: boolean;
  navOpen: boolean;
  hintsOpen: boolean;
  onReveal: () => void;
  onHide: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  typedAnswer?: string;
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
  const m = speedMultiplier(motionSpeed);
  const isTyping = Boolean(isTypingCard);
  const [swipe, setSwipe] = useState({ x: 0, hint: null as 'left' | 'right' | null });
  const audioCard = isAudioCardFront(card.front);
  const [showAudioFront, setShowAudioFront] = useState(false);
  const [hasSwiped, setHasSwiped] = useState(() => {
    try {
      return localStorage.getItem('lacuna.learnHints') === '1';
    } catch {
      return false;
    }
  });
  const swipeRef = useRef({ x: 0, startX: 0, startY: 0, dragging: false, isSwipe: false });
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
      if (menuOpen || editing || navOpen || hintsOpen) return;
      event.preventDefault();
      replayAudio();
    };
    window.addEventListener('keydown', onReplayKey);
    return () => window.removeEventListener('keydown', onReplayKey);
  }, [audioCard, phase, menuOpen, editing, navOpen, hintsOpen, replayAudio]);

  // Follow the pointer without spring lag; only an abandoned swipe springs back.
  const swipeXMotion = useMotionValue(0);
  const resetSwipe = useCallback(() => {
    if (m === 0) swipeXMotion.jump(0);
    else animate(swipeXMotion, 0, { type: 'spring', stiffness: 480, damping: 38 });
    setSwipe({ x: 0, hint: null });
  }, [m, swipeXMotion]);
  useEffect(() => () => swipeXMotion.stop(), [swipeXMotion]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (swipeRef.current.dragging || committed.current || !isPresent) return;
      if ((e.target as Element).closest('audio, button, input, textarea, a')) return;
      // Ignore swipes when any overlay is open.
      if (menuOpen || editing || navOpen || hintsOpen) return;
      swipeXMotion.stop();
      swipeRef.current = {
        x: 0,
        startX: e.clientX,
        startY: e.clientY,
        dragging: true,
        isSwipe: false,
      };
      selectionLenRef.current = window.getSelection()?.toString().length ?? 0;
      containerRef.current?.setPointerCapture?.(e.pointerId);
      setSwipe({ x: 0, hint: null });
    },
    [menuOpen, editing, navOpen, hintsOpen, isPresent, swipeXMotion],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeRef.current.dragging) return;
      const dx = e.clientX - swipeRef.current.startX;
      const dy = e.clientY - swipeRef.current.startY;
      // Decide whether this is a horizontal swipe or a vertical scroll.
      // Swipe-to-grade is only enabled during the answer phase, matching keyboard shortcuts.
      if (!swipeRef.current.isSwipe && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        if (phase === 'answer') {
          swipeRef.current.isSwipe = true;
        }
      }
      if (!swipeRef.current.isSwipe) return;
      swipeRef.current.x = dx;
      swipeXMotion.set(dx);
      const hint: 'left' | 'right' | null =
        dx < -swipeThreshold / 2 ? 'left' : dx > swipeThreshold / 2 ? 'right' : null;
      setSwipe({ x: dx, hint });
    },
    [phase, swipeXMotion],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeRef.current.dragging) return;
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      swipeRef.current.dragging = false;
      const dx = swipeRef.current.x;
      const wasSwipe = swipeRef.current.isSwipe;
      swipeRef.current.isSwipe = false;
      if (wasSwipe) {
        if (Math.abs(dx) > swipeThreshold && phase === 'answer') {
          committed.current = true;
          hapticMedium();
          setHasSwiped(true);
          try {
            localStorage.setItem('lacuna.learnHints', '1');
          } catch {
            /* ignore */
          }
          // The shared transition carries swipe, button and keyboard grades off-screen.
          void onAnswer(dx > 0, 'touch');
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
        setSwipe({ x: 0, hint: null });
        if (!selectionGrew || !isInsideCard) {
          if (phase === 'question') onReveal();
          else if (phase === 'answer' && audioCard) setShowAudioFront((visible) => !visible);
          else if (phase === 'answer') onHide();
        }
      }
    },
    [phase, audioCard, onReveal, onHide, onAnswer, resetSwipe],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (committed.current) return;
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      swipeRef.current.dragging = false;
      swipeRef.current.isSwipe = false;
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
      setSwipe({ x: 0, hint: null });
    }
  }, [phase, isPresent, swipeXMotion]);

  const displayedFront = !revealed || showAudioFront;
  const surfaceClassName =
    'flex min-h-[12rem] flex-col items-center justify-center rounded-3xl border bg-surface px-6 py-10 md:min-h-[14rem] md:px-12 md:py-14';

  const { height: stableHeight, frontRef, backRef } = useStableCardHeight();
  const face = (side: 'front' | 'back', measuring = false) => (
    <StudyCardFace
      card={card}
      side={side}
      audioCard={audioCard}
      audioAutoplay={audioCard && side === 'front'}
      isLinesModeCard={isLinesModeCard}
      hintStep={hintStep}
      hintAffectsScheduling={hintAffectsScheduling}
      isTyping={isTyping}
      typedAnswer={typedAnswer}
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
    <div className="flex flex-1 items-center justify-center" style={{ perspective: '1600px' }}>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={
          displayedFront ? (revealed ? 'Show answer again' : 'Show answer') : 'Hide answer'
        }
        className="relative w-full cursor-pointer"
        style={{ transformStyle: 'preserve-3d', touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={(event) => {
          if (committed.current || !isPresent) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (phase === 'question') onReveal();
          else if (phase === 'answer' && audioCard) setShowAudioFront((visible) => !visible);
          else if (phase === 'answer') onHide();
        }}
      >
        <CardSizeMeasurements
          front={face('front', true)}
          back={face('back', true)}
          surfaceClassName={surfaceClassName}
          frontRef={frontRef}
          backRef={backRef}
        />

        {/* Touch swipe indicators — persistent hints that show the available gestures. */}
        {isTouchMode &&
          phase === 'answer' &&
          !hasSwiped &&
          !swipe.hint &&
          !menuOpen &&
          !editing &&
          !navOpen &&
          !hintsOpen && (
            <>
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-20 flex items-center"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 0.5, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.6, duration: 0.35 * m, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col items-center gap-1 rounded-r-lg bg-negative/10 px-2 py-3">
                  <CloseIcon width={16} height={16} className="text-negative" />
                  <span className="text-[10px] text-negative">Swipe left</span>
                </div>
              </motion.div>
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 0.5, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.6, duration: 0.35 * m, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col items-center gap-1 rounded-l-lg bg-positive/10 px-2 py-3">
                  <CheckIcon width={16} height={16} className="text-positive" />
                  <span className="text-[10px] text-positive">Swipe right</span>
                </div>
              </motion.div>
            </>
          )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={displayedFront ? 'front' : 'back'}
            initial={m > 0 ? { rotateX: -92, opacity: 0, scale: 0.97 } : false}
            animate={m > 0 ? { rotateX: 0, opacity: 1, scale: 1 } : undefined}
            exit={m > 0 ? { rotateX: 92, opacity: 0, scale: 0.97 } : undefined}
            transition={{
              rotateX: { duration: 0.09 * m, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.09 * m, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.09 * m, ease: [0.16, 1, 0.3, 1] },
            }}
            style={{ transformOrigin: 'center center', x: swipeXMotion, minHeight: stableHeight }}
            className={cn(
              // A modest floor keeps short cards from looking like a stray label without
              // making a two-line card float in an otherwise empty container. Longer cards
              // grow past it as before.
              'relative z-10 ' + surfaceClassName,
              modeBorderClass(mode, revealed),
            )}
          >
            {/* Keep drag feedback on the card, away from the page-wide grading pulse. */}
            {swipe.hint && (
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute top-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                  swipe.hint === 'right'
                    ? 'left-4 bg-positive/10 text-positive'
                    : 'right-4 bg-negative/10 text-negative',
                )}
                style={{ opacity: Math.min(1, Math.abs(swipe.x) / swipeThreshold) }}
              >
                {swipe.hint === 'right' ? (
                  <CheckIcon width={14} height={14} />
                ) : (
                  <CloseIcon width={14} height={14} />
                )}
                {swipe.hint === 'right' ? 'Yes' : 'No'}
              </div>
            )}
            {face(displayedFront ? 'front' : 'back')}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
