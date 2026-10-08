// One card in a card list: question, answer and schedule, with swipe and hover actions and
// an expandable analytics panel. Rendered by CardListBody, for ordinary and generated cards.

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useMotionValue, useSpring } from 'motion/react';
import { RelatedQuestionSets } from '../question-sets/RelatedQuestionSets';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { CheckIcon, CloseIcon, EditIcon, FlagIcon, TagIcon, TrashIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import { isLeech } from '../../fsrs/leech';
import { useIsTouchMode } from '../../state/inputMode';
import { resolveOcclusionAnswerText } from '../../db/occlusionGeneration';
import type { Card, Occlusion, SchedulerConfig } from '../../db/types';
import { GeneratedCardBadge } from './GeneratedCardBadge';
import { ExpandedCardAnalytics } from './ExpandedCardAnalytics';
import { cardKindLabel, cardScheduleLabel } from './lessonCardRow';
import { ScheduleChip } from './ScheduleChip';
import { OcclusionThumbnail } from './OcclusionThumbnail';

const CardContent = lazy(() =>
  import('./CardContent').then((module) => ({ default: module.CardContent })),
);

/** Rows stagger by this much, up to STAGGER_CAP_S, so a full window still lands quickly. */
const STAGGER_STEP_S = 0.03;
const STAGGER_CAP_S = 0.25;

export const CardRow = React.memo(function CardRow({
  card,
  schedulingConfig,
  staggerIndex,
  selectMode,
  selected,
  expanded,
  onToggle,
  onToggleExpand,
  onEdit,
  onResume,
  onDelete,
  linked,
  onUnlink,
  onToggleFlag,
  motionMultiplier,
  skipAnimation,
  occlusion,
}: {
  card: Card;
  schedulingConfig: SchedulerConfig;
  /** Position within the rendered rows, not within `cards`: it only paces the entry stagger. */
  staggerIndex: number;
  selectMode: boolean;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onResume: () => void;
  onDelete: () => void;
  linked: boolean;
  onUnlink: () => void;
  onToggleFlag: (card: Card) => void;
  motionMultiplier?: number;
  skipAnimation?: boolean;
  /** The occlusion that generated this card, so the row can show its diagram. */
  occlusion?: Occlusion;
}) {
  const m = motionMultiplier ?? 1;
  const isTouchMode = useIsTouchMode();

  const tags = card.tags ?? [];
  const leech = isLeech(card);
  const flagged = card.flagged === true;
  const schedule = cardScheduleLabel(card, Date.now());
  // An occlusion card's stored back repeats its front; the region's answer says more.
  const occlusionAnswer =
    occlusion && card.occlusionRegionId
      ? resolveOcclusionAnswerText(occlusion, card.occlusionRegionId)
      : undefined;
  // Generated cards are owned by their Sequence or Occlusion: content edits and deletes
  // happen there, never here, so selection and deletion are suppressed regardless of
  // selectMode/hover. Scheduling actions (flag/suspend/bury/reschedule/resume) stay fully
  // available.
  const isSequenceGenerated = card.sequenceItemId !== null && card.sequenceItemId !== undefined;
  const isOcclusionGenerated =
    card.occlusionRegionId !== null && card.occlusionRegionId !== undefined;
  const generated = isSequenceGenerated || isOcclusionGenerated;
  const removable = linked || !generated;

  // Swipe-to-reveal state — multi-directional in touch mode.
  const [trayOpen, setTrayOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  useEffect(() => {
    if (selectMode || expanded) {
      setTrayOpen(false);
      dragX.set(0);
    }
  }, [selectMode, expanded, dragX]);
  const springX = useSpring(dragX, { stiffness: 420, damping: 30, mass: 0.8 });
  const swipeState = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    isSwipe: false,
    openBeforeDrag: false,
  });
  const trayWidth = 220;
  const swipeThreshold = 40;
  const MAX_DRAG = 120;

  // Refs for stable callback dependencies
  const trayOpenRef = useRef(trayOpen);
  const cardRefForCallback = useRef(card);
  useEffect(() => {
    trayOpenRef.current = trayOpen;
  }, [trayOpen]);
  useEffect(() => {
    cardRefForCallback.current = card;
  }, [card]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (selectMode || expanded) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button:not([data-card-details]), a, [role="button"]')) return;
      e.stopPropagation();
      dragX.jump(springX.get());
      springX.jump(dragX.get());
      swipeState.current = {
        dragging: true,
        startX: e.clientX - springX.get() + (trayOpenRef.current ? -trayWidth : 0),
        startY: e.clientY,
        isSwipe: false,
        openBeforeDrag: trayOpenRef.current,
      };
      cardRef.current?.setPointerCapture(e.pointerId);
    },
    [selectMode, expanded, dragX, springX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeState.current.dragging) return;
      const dx = e.clientX - swipeState.current.startX;
      const dy = e.clientY - swipeState.current.startY;

      if (!swipeState.current.isSwipe && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        swipeState.current.isSwipe = true;
      }
      if (!swipeState.current.isSwipe) return;

      e.preventDefault();

      // If tray was already open, dragging right closes it; dragging left keeps it open.
      // If tray was closed, dragging left opens it; dragging right triggers quick flag.
      const base = swipeState.current.openBeforeDrag ? -trayWidth : 0;
      const clamped = Math.max(-trayWidth, Math.min(isTouchMode ? MAX_DRAG : 0, base + dx));
      dragX.set(clamped);
      springX.jump(clamped);
    },
    [dragX, springX, isTouchMode],
  );

  const justHandledTap = useRef(false);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeState.current.dragging) return;
      cardRef.current?.releasePointerCapture(e.pointerId);
      swipeState.current.dragging = false;
      const wasSwipe = swipeState.current.isSwipe;
      swipeState.current.isSwipe = false;

      if (wasSwipe) {
        e.stopPropagation();
        justHandledTap.current = true;
        const currentX = dragX.get();
        // If open before drag, drag right to close; if closed, drag left to open.
        if (swipeState.current.openBeforeDrag) {
          // Tray was open — close if dragged right past threshold
          if (currentX > -trayWidth + swipeThreshold) {
            setTrayOpen(false);
            dragX.set(0);
          } else {
            setTrayOpen(true);
            dragX.set(-trayWidth);
          }
        } else {
          // Tray was closed
          if (currentX < -swipeThreshold) {
            // Drag left — open tray
            hapticLight();
            setTrayOpen(true);
            dragX.set(-trayWidth);
          } else if (isTouchMode && currentX > swipeThreshold) {
            // Drag right — quick flag (touch mode only)
            hapticLight();
            dragX.set(0);
            onToggleFlag(cardRefForCallback.current);
          } else {
            setTrayOpen(false);
            dragX.set(0);
          }
        }
      } else {
        // It was a tap — close the tray if it is open; suppress the subsequent click.
        if (trayOpenRef.current) {
          hapticLight();
          justHandledTap.current = true;
          setTrayOpen(false);
          dragX.set(0);
        }
      }
    },
    [dragX, isTouchMode, onToggleFlag],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      cardRef.current?.releasePointerCapture(e.pointerId);
      swipeState.current.dragging = false;
      swipeState.current.isSwipe = false;
      dragX.set(trayOpenRef.current ? -trayWidth : 0);
    },
    [dragX],
  );

  const handleClick = useCallback(() => {
    if (justHandledTap.current) {
      justHandledTap.current = false;
      return;
    }
    if (selectMode && !generated && !linked) {
      onToggle();
    } else if (trayOpenRef.current) {
      setTrayOpen(false);
      dragX.set(0);
    } else {
      onToggleExpand();
    }
  }, [selectMode, generated, linked, onToggle, onToggleExpand, dragX]);

  const handleFlagClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onToggleFlag(cardRefForCallback.current);
    },
    [onToggleFlag],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onEdit();
    },
    [onEdit],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticMedium();
      onDelete();
    },
    [onDelete],
  );

  const handleUnlinkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hapticLight();
      onUnlink();
    },
    [onUnlink],
  );

  const handleResumeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onResume();
    },
    [onResume],
  );

  const handleFlagHoverClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFlag(cardRefForCallback.current);
    },
    [onToggleFlag],
  );

  const handleExpandedClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className={cn('group relative rounded-2xl bg-surface transition-colors duration-200')}>
      {/* Action tray revealed behind the card on swipe-left */}
      <div
        data-card-swipe-tray
        inert={!trayOpen}
        className="absolute inset-y-0 right-0 z-0 flex items-center overflow-hidden rounded-r-2xl"
        style={{ width: trayWidth }}
      >
        <div className="flex h-full w-full items-center">
          <button
            type="button"
            aria-label={flagged ? 'Remove flag from card' : 'Flag card'}
            aria-pressed={flagged}
            onClick={handleFlagClick}
            className={cn(
              'flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
              flagged
                ? 'bg-accent/10 text-accent hover:bg-accent/20'
                : 'bg-ink/[0.03] text-ink-soft hover:bg-ink/5',
            )}
          >
            <FlagIcon width={18} height={18} />
            {flagged ? 'Unflag' : 'Flag'}
          </button>
          <button
            type="button"
            aria-label="Edit card"
            onClick={handleEditClick}
            className="flex h-full flex-1 flex-col items-center justify-center gap-1 bg-ink/[0.03] text-xs text-ink-soft transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <EditIcon width={18} height={18} />
            Edit
          </button>
          {removable && (
            <button
              type="button"
              aria-label={linked ? 'Remove card from lesson' : 'Delete card'}
              onClick={linked ? handleUnlinkClick : handleDeleteClick}
              className={cn(
                'flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
                linked
                  ? 'bg-ink/[0.03] text-ink-soft hover:bg-ink/5 hover:text-ink'
                  : 'bg-negative/10 text-negative hover:bg-negative/20',
              )}
            >
              {linked ? <CloseIcon width={18} height={18} /> : <TrashIcon width={18} height={18} />}
              {linked ? 'Remove' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <motion.div
        ref={cardRef}
        style={{ x: springX, touchAction: 'pan-y' }}
        initial={skipAnimation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          skipAnimation
            ? { duration: 0, delay: 0 }
            : {
                duration: 0.16 * m,
                delay: Math.min(staggerIndex * STAGGER_STEP_S, STAGGER_CAP_S) * m,
              }
        }
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        data-card-id={card.id}
        className={cn(
          'relative z-10 cursor-pointer rounded-2xl px-4 py-3 transition-[background-color,box-shadow]',
          // The tint is an inset shadow over an opaque surface: a translucent background
          // would show the swipe tray behind the row on hover.
          selected
            ? 'bg-accent-soft'
            : 'bg-surface hover:shadow-[inset_0_0_0_100vmax_hsl(var(--ink)/0.04)] active:shadow-[inset_0_0_0_100vmax_hsl(var(--ink)/0.07)]',
        )}
      >
        <button
          type="button"
          data-card-details
          aria-label={`${selectMode && !generated && !linked ? 'Select card' : 'Card details'}: ${card.front || cardKindLabel(card)}`}
          aria-expanded={selectMode && !generated && !linked ? undefined : expanded}
          aria-pressed={selectMode && !generated && !linked ? selected : undefined}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="relative flex items-center gap-3 sm:gap-4">
          {selectMode && !generated && !linked && (
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                selected ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
              )}
            >
              {selected && <CheckIcon width={12} height={12} />}
            </span>
          )}

          {occlusion && isOcclusionGenerated && (
            <OcclusionThumbnail card={card} occlusion={occlusion} />
          )}

          <div className="min-w-0 flex-1">
            {/* Two lines of question and one of answer, clamped by line so maths keeps its height. */}
            <div className="card-row-clamp line-clamp-2 max-h-[3.75rem] text-[15px] font-semibold text-ink">
              <Suspense
                fallback={<Skeleton as="span" className="inline-block h-4 w-24 rounded bg-ink/5" />}
              >
                <CardContent card={card} side="front" />
              </Suspense>
            </div>
            <div
              data-card-answer
              className="card-row-clamp mt-0.5 line-clamp-1 max-h-8 text-[13px] text-ink-soft"
            >
              {occlusionAnswer !== undefined ? (
                occlusionAnswer
              ) : (
                <Suspense fallback={null}>
                  <CardContent card={card} side="back" />
                </Suspense>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TagIcon width={13} height={13} className="text-ink-faint" />
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink-soft"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* The schedule and the actions share one cell: hovering or focusing the row
              swaps one for the other, so the actions take no width of their own. */}
          <div className="grid shrink-0 items-center justify-items-end">
            <div
              className={cn(
                'flex flex-col items-end gap-1 transition-opacity [grid-area:1/1]',
                !selectMode &&
                  'sm:[@media(hover:hover)]:group-hover:opacity-0 sm:[@media(hover:hover)]:group-focus-within:opacity-0',
              )}
            >
              <ScheduleChip schedule={schedule} />
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-faint">
                {flagged && <FlagIcon width={12} height={12} className="text-accent" aria-label="Flagged" />}
                {leech && (
                  <span
                    title={`Failed ${card.lapses} times. Consider rewording or splitting this card.`}
                    className="font-semibold text-negative"
                  >
                    Leech
                  </span>
                )}
                {linked && <span className="font-semibold text-accent-ink">Linked</span>}
                {/* A generated card's badge already names its kind. */}
                {isOcclusionGenerated ? (
                  <GeneratedCardBadge kind="occlusion" />
                ) : (
                  <span>{cardKindLabel(card)}</span>
                )}
              </span>
            </div>
            {!selectMode && (
              // Narrow and touch screens reach these through the swipe tray and the expanded row.
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity [grid-area:1/1] focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:hidden [@media(hover:none)]:hidden">
                {card.suspended && (
                  <button
                    type="button"
                    onClick={handleResumeClick}
                    title="Resume card"
                    className="min-h-11 rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent active:bg-ink/10"
                  >
                    Resume
                  </button>
                )}
                <motion.button
                  type="button"
                  onClick={handleFlagHoverClick}
                  title={flagged ? 'Remove flag' : 'Flag card'}
                  aria-pressed={flagged}
                  data-press=""
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 transition-colors hover:bg-ink/5 hover:text-accent',
                    flagged ? 'text-accent' : 'text-ink-faint',
                  )}
                >
                  <FlagIcon width={16} height={16} />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleEditClick}
                  title="Edit card"
                  data-press=""
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent"
                >
                  <EditIcon width={16} height={16} />
                </motion.button>
                {removable && (
                  <motion.button
                    type="button"
                    onClick={linked ? handleUnlinkClick : handleDeleteClick}
                    title={linked ? 'Remove from lesson' : 'Delete card'}
                    data-press=""
                    whileTap={{ scale: 0.85 }}
                    whileHover={{ scale: 1.08 }}
                    className={cn(
                      'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-ink-faint transition-colors',
                      linked
                        ? 'hover:bg-ink/5 hover:text-ink'
                        : 'hover:bg-negative/10 hover:text-negative',
                    )}
                  >
                    {linked ? (
                      <CloseIcon width={16} height={16} />
                    ) : (
                      <TrashIcon width={16} height={16} />
                    )}
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
              className="relative mt-4"
              onClick={handleExpandedClick}
            >
              <div className="border-t border-line pt-4">
                {/* The row's own actions, for touch screens where they do not appear on hover. */}
                {!selectMode && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={handleEditClick}>
                      <EditIcon width={15} height={15} />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-pressed={flagged}
                      onClick={handleFlagHoverClick}
                    >
                      <FlagIcon width={15} height={15} />
                      {flagged ? 'Unflag' : 'Flag'}
                    </Button>
                    {card.suspended && (
                      <Button size="sm" variant="secondary" onClick={handleResumeClick}>
                        Resume
                      </Button>
                    )}
                    {removable && (
                      <Button
                        size="sm"
                        variant={linked ? 'secondary' : 'danger'}
                        onClick={linked ? handleUnlinkClick : handleDeleteClick}
                      >
                        {linked ? 'Remove from lesson' : 'Delete'}
                      </Button>
                    )}
                  </div>
                )}
                <ExpandedCardAnalytics
                  card={card}
                  schedulingConfig={schedulingConfig}
                  motionMultiplier={m}
                />
                {card.courseId && <RelatedQuestionSets courseId={card.courseId} cardId={card.id} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
