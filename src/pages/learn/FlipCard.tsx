import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useMotionValue, useSpring } from 'motion/react';
import { hapticMedium } from '../../utils/haptic';
import type { Card, Grade, Occlusion } from '../../db/types';
import { CardContent } from '../../components/cards/CardContent';
import { LineHintButton, LineHintDisplay } from '../../components/learn/LineHint';
import { speedMultiplier, type MotionSpeed } from '../../state/motionSpeed';
import type { AnswerStrictness } from '../../state/answerStrictness';
import { answerComparisonOptions } from '../../state/answerStrictness';
import { compareAnswer } from '../../utils/answerComparison';
import { cn } from '../../components/ui/cn';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { typingExpectedAnswer } from './sessionCardCapabilities';
import type { LearnModeType, Phase } from './types';
import { isAudioCardFront } from '../../media/audio';

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
 * is springy — the card follows the finger, a directional glow hints at the outcome,
 * and releasing past the threshold commits the answer with a satisfying snap.
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
  const maxDrag = 180;

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

  // Spring-physics x position for the snap-back so the card feels tactile.
  const swipeXMotion = useMotionValue(0);
  const swipeXSpring = useSpring(swipeXMotion, { stiffness: 480, damping: 32, mass: 0.9 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (swipeRef.current.dragging) return;
      if ((e.target as Element).closest('audio, button, input, textarea, a')) return;
      // Ignore swipes when any overlay is open.
      if (menuOpen || editing || navOpen || hintsOpen) return;
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
    [menuOpen, editing, navOpen, hintsOpen],
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
      // Clamp the visual drag so the card never flies off-screen.
      const clamped = Math.max(-maxDrag, Math.min(maxDrag, dx));
      swipeRef.current.x = clamped;
      swipeXMotion.set(clamped);
      const hint: 'left' | 'right' | null =
        clamped < -swipeThreshold / 2 ? 'left' : clamped > swipeThreshold / 2 ? 'right' : null;
      setSwipe({ x: clamped, hint });
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
        if (dx < -swipeThreshold) {
          // Swipe left = No
          if (phase === 'answer') {
            hapticMedium();
            setHasSwiped(true);
            try {
              localStorage.setItem('lacuna.learnHints', '1');
            } catch {
              /* ignore */
            }
            swipeXMotion.set(0);
            setSwipe({ x: 0, hint: null });
            void onAnswer(false, 'touch');
          } else {
            // Snap back if not in answer phase.
            swipeXMotion.set(0);
            setSwipe({ x: 0, hint: null });
          }
        } else if (dx > swipeThreshold) {
          // Swipe right = Yes
          if (phase === 'answer') {
            hapticMedium();
            setHasSwiped(true);
            try {
              localStorage.setItem('lacuna.learnHints', '1');
            } catch {
              /* ignore */
            }
            swipeXMotion.set(0);
            setSwipe({ x: 0, hint: null });
            void onAnswer(true, 'touch');
          } else {
            swipeXMotion.set(0);
            setSwipe({ x: 0, hint: null });
          }
        } else {
          // Not far enough — spring back.
          swipeXMotion.set(0);
          setSwipe({ x: 0, hint: null });
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
    [phase, audioCard, onReveal, onHide, onAnswer, swipeXMotion],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      swipeRef.current.dragging = false;
      swipeRef.current.isSwipe = false;
      swipeXMotion.set(0);
      setSwipe({ x: 0, hint: null });
    },
    [swipeXMotion],
  );

  // Safety net: clear any lingering swipe state when the card flips back to question.
  useEffect(() => {
    if (phase === 'question') {
      setShowAudioFront(false);
      swipeXMotion.set(0);
      setSwipe({ x: 0, hint: null });
    }
  }, [phase, swipeXMotion]);

  const displayedFront = !revealed || showAudioFront;

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
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (phase === 'question') onReveal();
          else if (phase === 'answer' && audioCard) setShowAudioFront((visible) => !visible);
          else if (phase === 'answer') onHide();
        }}
      >
        {/* Swipe hint glow — appears during a drag to whisper the outcome.
            Positioned behind the card so the border stays crisp. */}
        <AnimatePresence>
          {swipe.hint && (
            <motion.div
              aria-hidden
              key={swipe.hint}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: swipe.x }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.12 * m }, x: { duration: 0 } }}
              className={
                'pointer-events-none absolute inset-y-0 z-0 w-56 rounded-3xl ' +
                (swipe.hint === 'right'
                  ? '-right-56 bg-gradient-to-r from-positive/20 to-transparent'
                  : '-left-56 bg-gradient-to-l from-negative/15 to-transparent')
              }
            />
          )}
        </AnimatePresence>

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
            initial={{ rotateX: -92, opacity: 0, scale: 0.97, x: swipe.x }}
            animate={{ rotateX: 0, opacity: 1, scale: 1 }}
            exit={{ rotateX: 92, opacity: 0, scale: 0.97, x: swipe.x }}
            transition={{
              x: { type: 'spring', stiffness: 480, damping: 32, mass: 0.9 },
              rotateX: { duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] },
            }}
            style={{ transformOrigin: 'center center', x: swipeXSpring }}
            className={cn(
              'relative z-10 flex min-h-[22rem] flex-col items-center justify-center rounded-3xl border bg-surface px-6 py-10 md:min-h-[29rem] md:px-12 md:py-14',
              modeBorderClass(mode, revealed),
            )}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 * m, delay: 0.14 * m, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-prose text-center text-lg leading-relaxed md:text-xl"
            >
              <CardContent
                card={card}
                side={displayedFront ? 'front' : 'back'}
                audioAutoplay={audioCard && displayedFront}
                sequenceCue
                sequenceMode={isLinesModeCard ? 'lines' : 'list'}
                occlusion={occlusion}
              />
            </motion.div>
            {audioCard && revealed && !displayedFront && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  replayAudio();
                }}
                className="mt-6 min-h-11 rounded-full border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                Hear it again <span className="ml-1 text-xs text-ink-faint">R</span>
              </button>
            )}
            {/* Hint ladder for lines-mode sequence cards: two optional, ungraded steps
                between question and reveal (see docs/archive/roadmap-2026-08-11.md §1.5). Clicking the button
                must not flip the card, hence the pointer/click guards. */}
            {isLinesModeCard && !revealed && phase === 'question' && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {(hintStep ?? 0) > 0 && (
                  <LineHintDisplay
                    answer={typingExpectedAnswer(card)}
                    step={hintStep as 1 | 2}
                    m={m}
                  />
                )}
                {(hintStep ?? 0) < 2 && (
                  <LineHintButton
                    step={(hintStep ?? 0) as 0 | 1}
                    onReveal={() => onRevealHint?.()}
                  />
                )}
              </div>
            )}
            {/* In "type your answer" mode, show the typed answer against the correct one on
                reveal, with per-word match/mismatch highlighting (see answerComparison.ts).
                This is feedback only — grading below is still the learner's own call. */}
            {isTyping &&
              revealed &&
              typedAnswer !== undefined &&
              (() => {
                const comparison = compareAnswer(
                  typedAnswer,
                  typingExpectedAnswer(card, occlusionAnswerText),
                  answerComparisonOptions(answerStrictness),
                );
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 * m, delay: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
                    className="mx-auto mt-6 max-w-prose border-t border-line pt-6 text-center"
                  >
                    <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                      Your answer
                    </div>
                    <div className="mb-4 text-lg text-ink">
                      {typedAnswer.trim() || <span className="italic text-ink-faint">(empty)</span>}
                    </div>
                    <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-accent">
                      Correct answer
                    </div>
                    <div className="text-lg">
                      {comparison.words.map((word, i) => (
                        <span
                          key={i}
                          className={
                            word.matched
                              ? 'text-positive'
                              : 'text-negative underline decoration-negative/50'
                          }
                        >
                          {word.text}
                          {i < comparison.words.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
