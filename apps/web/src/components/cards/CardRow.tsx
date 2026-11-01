// One card in a card list: question, answer and schedule, with swipe and hover actions and
// an expandable analytics panel. Rendered by CardListBody, for ordinary and generated cards.

import React, { lazy } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { RelatedQuestionSets } from '../question-sets/RelatedQuestionSets';
import { Button } from '../ui/Button';
import { PageLoadingBoundary } from '../ui/PageLoadingBoundary';
import { CheckIcon, CloseIcon, EditIcon, FlagIcon, TagIcon, TrashIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { isLeech } from '@lacuna/core/fsrs/leech';
import { resolveOcclusionAnswerText } from '../../db/occlusionGeneration';
import type { Card, Occlusion, SchedulerConfig } from '@lacuna/core/db/types';
import { GeneratedCardBadge } from './GeneratedCardBadge';
import { ExpandedCardAnalytics } from './ExpandedCardAnalytics';
import { cardKindLabel, cardScheduleLabel } from './lessonCardRow';
import { CardKindIcon } from './CardKindIcon';
import { ScheduleChip } from './ScheduleChip';
import { OcclusionThumbnail } from './OcclusionThumbnail';
import { useCardRowGestures } from './useCardRowGestures';

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
  compactMetadata = false,
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
  compactMetadata?: boolean;
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const m = multiplier === 0 ? 0 : (motionMultiplier ?? multiplier);

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

  const {
    trayOpen,
    cardRef,
    dragX,
    springX,
    trayVisibility,
    trayWidth,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
    handleFlagClick,
    handleEditClick,
    handleDeleteClick,
    handleUnlinkClick,
    handleResumeClick,
    handleFlagHoverClick,
    handleExpandedClick,
  } = useCardRowGestures({
    card,
    selectMode,
    expanded,
    generated,
    linked,
    onToggle,
    onToggleExpand,
    onToggleFlag,
    onEdit,
    onDelete,
    onUnlink,
    onResume,
    m,
  });

  return (
    <div className={cn('group relative rounded-2xl bg-surface transition-colors duration-200')}>
      {/* Action tray revealed behind the card on swipe-left */}
      <motion.div
        data-card-swipe-tray
        inert={!trayOpen}
        className="absolute inset-y-0 right-0 z-0 flex items-center overflow-hidden rounded-r-2xl"
        style={{ width: trayWidth, visibility: trayVisibility }}
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
                ? 'bg-accent/10 text-accent-ink hover:bg-accent/20'
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
            className="flex h-full flex-1 flex-col items-center justify-center gap-1 bg-ink/[0.03] text-xs text-ink-soft transition-colors hover:bg-accent/10 hover:text-accent-ink"
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
      </motion.div>

      <motion.div
        ref={cardRef}
        style={{ x: m === 0 ? dragX : springX, touchAction: 'pan-y' }}
        initial={skipAnimation || m === 0 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
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
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        />
        <div
          className={cn(
            'relative flex gap-3 sm:gap-4',
            compactMetadata ? 'items-start' : 'items-center',
          )}
        >
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
            <PageLoadingBoundary animateArrival={!skipAnimation}>
              <div className="card-row-clamp line-clamp-2 max-h-[3.75rem] text-[15px] font-semibold text-ink">
                <CardContent card={card} side="front" />
              </div>
            </PageLoadingBoundary>
            <PageLoadingBoundary animateArrival={!skipAnimation}>
              <div
                data-card-answer
                className="card-row-clamp mt-0.5 line-clamp-1 max-h-8 text-[13px] text-ink-soft"
              >
                {occlusionAnswer !== undefined ? (
                  occlusionAnswer
                ) : (
                  <CardContent card={card} side="back" />
                )}
              </div>
            </PageLoadingBoundary>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TagIcon width={13} height={13} className="text-ink-faint" />
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* The schedule and the actions share one cell: hovering or focusing the row
              swaps one for the other, so the actions take no width of their own. */}
          <div
            className={cn(
              'grid shrink-0 justify-items-end',
              compactMetadata ? 'items-start' : 'items-center',
            )}
          >
            <div
              className={cn(
                'flex flex-col items-end gap-1 transition-opacity [grid-area:1/1]',
                !selectMode &&
                  'sm:[@media(hover:hover)]:group-hover:opacity-0 sm:[@media(hover:hover)]:group-focus-within:opacity-0',
              )}
            >
              {compactMetadata ? (
                <div className="flex min-h-6 items-center gap-1.5">
                  <CardKindIcon card={card} />
                  <ScheduleChip schedule={schedule} />
                </div>
              ) : (
                <ScheduleChip schedule={schedule} />
              )}
              {(!compactMetadata || flagged || leech || linked) && (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-faint">
                  {flagged && (
                    <FlagIcon
                      width={12}
                      height={12}
                      className="text-accent-ink"
                      aria-label="Flagged"
                    />
                  )}
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
                  {!compactMetadata &&
                    (isOcclusionGenerated ? (
                      <GeneratedCardBadge kind="occlusion" />
                    ) : (
                      <span>{cardKindLabel(card)}</span>
                    ))}
                </span>
              )}
            </div>
            {!selectMode && (
              // Narrow and touch screens reach these through the swipe tray and the expanded row.
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity [grid-area:1/1] focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:hidden [@media(hover:none)]:hidden">
                {card.suspended && (
                  <button
                    type="button"
                    onClick={handleResumeClick}
                    title="Resume card"
                    className="min-h-11 rounded-full px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent-ink active:bg-ink/10"
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
                  whileTap={m > 0 ? { scale: 0.96 } : undefined}
                  whileHover={m > 0 ? { scale: 1.02 } : undefined}
                  transition={scaledSpring(m, 400, 30)}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition-colors hover:bg-ink/5 hover:text-accent-ink',
                    flagged ? 'text-accent-ink' : 'text-ink-faint',
                  )}
                >
                  <FlagIcon width={16} height={16} />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleEditClick}
                  title="Edit card"
                  data-press=""
                  whileTap={m > 0 ? { scale: 0.96 } : undefined}
                  whileHover={m > 0 ? { scale: 1.02 } : undefined}
                  transition={scaledSpring(m, 400, 30)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent-ink"
                >
                  <EditIcon width={16} height={16} />
                </motion.button>
                {removable && (
                  <motion.button
                    type="button"
                    onClick={linked ? handleUnlinkClick : handleDeleteClick}
                    title={linked ? 'Remove from lesson' : 'Delete card'}
                    data-press=""
                    whileTap={m > 0 ? { scale: 0.96 } : undefined}
                    whileHover={m > 0 ? { scale: 1.02 } : undefined}
                    transition={scaledSpring(m, 400, 30)}
                    className={cn(
                      'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-ink-faint transition-colors',
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
