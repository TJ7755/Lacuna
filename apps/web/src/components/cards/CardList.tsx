import { Input, fieldLabelClassName } from '../ui/Field';
import React, { useEffect, useState } from 'react';

import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '../ui/Button';
import { SelectedCardsAnswerMode } from './AnswerModeControl';
import { Select } from '../ui/Select';
import { CheckIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { GroupedCardList } from './GroupedCardList';
import type { Card, Occlusion, Sequence } from '@lacuna/core/db/types';
import type { CardListContext } from './cardListContext';
import { BulkBarButton, CardBulkBar } from './CardBulkBar';

import { countOf } from '../../utils/plural';

import { useCardListActions, type AssignableLesson } from './useCardListActions';

interface CardListBaseProps {
  cards: Card[];
  onEditCard: (card: Card) => void;
  /** When true, suppresses the internal "Cards (N)" heading row. */
  hideHeader?: boolean;
  /** Replaces the default heading, sharing its row with the list's actions. */
  heading?: React.ReactNode;
  /** Keeps the heading row in view below the course bar while its cards scroll past. */
  stickyHeader?: boolean;
  /** Lesson controls between the heading and the card rows. */
  beforeCards?: React.ReactNode;
  /** Compact metadata for the lesson workspace, leaving other card lists unchanged. */
  compactMetadata?: boolean;
  /** When supplied with courseId, enables bulk lesson assignment. */
  assignableLessons?: AssignableLesson[];
  courseId?: string;
  sequences?: Sequence[];
  onEditSequence?: (sequenceId: string) => void;
  occlusions?: Occlusion[];
  onEditOcclusion?: (occlusionId: string) => void;
  linkedCardIds?: ReadonlySet<string>;
  onUnlinkCard?: (card: Card) => void;
}

type CardListProps = CardListBaseProps & { context: CardListContext };

export function CardList({
  cards,
  context,
  onEditCard,
  hideHeader = false,
  heading,
  stickyHeader = false,
  beforeCards,
  compactMetadata = false,
  assignableLessons,
  courseId,
  sequences,
  onEditSequence,
  occlusions,
  onEditOcclusion,
  linkedCardIds,
  onUnlinkCard,
}: CardListProps) {
  const schedulingConfig = context.schedulingConfig;
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  useEffect(() => {
    setExpandedCardId(null);
  }, [schedulingConfig.id]);
  const {
    selectMode,
    setSelectMode,
    selected,
    tagging,
    setTagging,
    tagValue,
    setTagValue,
    rescheduling,
    setRescheduling,
    rescheduleMode,
    setRescheduleMode,
    assigningLesson,
    setAssigningLesson,
    assignTarget,
    setAssignTarget,
    tagSuggestions,
    selectableCards,
    toggle,
    allSelected,
    toggleAll,
    selectButton,
    exitSelect,
    handleSuspend,
    handleAddTag,
    handleRemoveTag,
    handleDelete,
    startTag,
    startReschedule,
    startAssignLesson,
    handleAssignLesson,
    handleBury,
    handleReschedule,
    handleResume,
    handleToggleFlag,
    handleDeleteOne,
  } = useCardListActions({ cards, linkedCardIds, assignableLessons, courseId });

  return (
    <div>
      <div
        className={cn(
          'mb-2 flex flex-wrap items-center gap-2',
          hideHeader && !heading && 'justify-end',
          // Sits under the 64px course bar, on the panel's own surface so rows pass beneath.
          // Phones keep it in the flow: there it wraps to two rows beneath the app bar.
          stickyHeader &&
            'sm:sticky sm:top-16 sm:z-[15] sm:-mx-4 sm:bg-surface/95 sm:px-4 sm:py-1 sm:backdrop-blur-md md:-mx-5 md:px-5',
        )}
      >
        {heading ??
          (!hideHeader && (
            <h2 className="font-display text-2xl">
              Cards <span className="text-ink-faint">({cards.length})</span>
            </h2>
          ))}
        <div
          className={cn(
            'flex items-center gap-2',
            (!hideHeader || heading !== undefined) && 'ml-auto',
          )}
        >
          {selectableCards.length > 0 && (
            <Button
              ref={selectButton}
              variant={selectMode ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                if (selectMode) {
                  exitSelect();
                } else {
                  setSelectMode(true);
                  setExpandedCardId(null);
                }
              }}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
        </div>
      </div>

      {beforeCards}

      <CardBulkBar
        open={selectMode}
        panel={
          (tagging || rescheduling || assigningLesson) && selected.size > 0 ? (
            <>
              {/* Inline tag chooser */}
              <AnimatePresence>
                {tagging && selected.size > 0 && (
                  <motion.div
                    initial={m > 0 ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={m > 0 ? { opacity: 0 } : undefined}
                    transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div>
                      <label className={fieldLabelClassName}>
                        Tag for {countOf(selected.size, 'card')}
                        <Input
                          autoFocus
                          list="bulk-tag-suggestions"
                          value={tagValue}
                          onChange={(e) => setTagValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleAddTag();
                            }
                          }}
                          placeholder="Type a tag…"
                        />
                        <datalist id="bulk-tag-suggestions">
                          {tagSuggestions.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </label>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setTagging(false)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleRemoveTag}
                          disabled={!tagValue.trim()}
                        >
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={handleAddTag}
                          disabled={!tagValue.trim()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline reschedule chooser */}
              <AnimatePresence>
                {rescheduling && selected.size > 0 && (
                  <motion.div
                    initial={m > 0 ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={m > 0 ? { opacity: 0 } : undefined}
                    transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div>
                      <fieldset className="space-y-2">
                        <legend className={`${fieldLabelClassName} mb-2`}>
                          Reschedule {countOf(selected.size, 'card')}
                        </legend>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="radio"
                            name="reschedule-mode"
                            value="new"
                            checked={rescheduleMode === 'new'}
                            onChange={() => setRescheduleMode('new')}
                            className="accent-accent"
                          />
                          Reset to new (clear scheduling)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="radio"
                            name="reschedule-mode"
                            value="dueNow"
                            checked={rescheduleMode === 'dueNow'}
                            onChange={() => setRescheduleMode('dueNow')}
                            className="accent-accent"
                          />
                          Make due now
                        </label>
                      </fieldset>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setRescheduling(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" variant="primary" onClick={handleReschedule}>
                          Reschedule
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline lesson assignment chooser */}
              <AnimatePresence>
                {assigningLesson && selected.size > 0 && assignableLessons && courseId && (
                  <motion.div
                    initial={m > 0 ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={m > 0 ? { opacity: 0 } : undefined}
                    transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div>
                      <label className={fieldLabelClassName}>
                        Assign {selected.size} card{selected.size === 1 ? '' : 's'} to
                        <Select
                          value={assignTarget}
                          onChange={(e) => setAssignTarget(e.target.value)}
                          className="mt-2 w-full"
                        >
                          <option value="">Unassigned</option>
                          {assignableLessons.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setAssigningLesson(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" variant="primary" onClick={handleAssignLesson}>
                          Assign
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : undefined
        }
      >
        <BulkBarButton onClick={toggleAll} aria-pressed={allSelected} className="px-3">
          <span
            className={cn(
              'grid h-5 w-5 place-items-center rounded-full border transition-colors',
              allSelected ? 'border-paper bg-paper text-ink' : 'border-paper/40',
            )}
          >
            {allSelected && <CheckIcon width={12} height={12} />}
          </span>
          {allSelected ? 'Deselect all' : 'Select all'}
        </BulkBarButton>
        <span className="px-2 text-sm font-semibold tabular-nums">{selected.size} selected</span>
        <SelectedCardsAnswerMode
          courseId={courseId}
          cards={cards.filter((card) => selected.has(card.id))}
        />
        <BulkBarButton
          active={tagging}
          disabled={selected.size === 0}
          onClick={() => (tagging ? setTagging(false) : startTag())}
        >
          Tag…
        </BulkBarButton>
        <BulkBarButton disabled={selected.size === 0} onClick={() => handleSuspend(true)}>
          Suspend
        </BulkBarButton>
        <BulkBarButton disabled={selected.size === 0} onClick={() => handleSuspend(false)}>
          Resume
        </BulkBarButton>
        <BulkBarButton disabled={selected.size === 0} onClick={handleBury}>
          Bury
        </BulkBarButton>
        <BulkBarButton
          active={rescheduling}
          disabled={selected.size === 0}
          onClick={() => (rescheduling ? setRescheduling(false) : startReschedule())}
        >
          Reschedule…
        </BulkBarButton>
        {assignableLessons && courseId && (
          <BulkBarButton
            active={assigningLesson}
            disabled={selected.size === 0}
            onClick={() => (assigningLesson ? setAssigningLesson(false) : startAssignLesson())}
          >
            Assign to lesson…
          </BulkBarButton>
        )}
        <BulkBarButton danger disabled={selected.size === 0} onClick={handleDelete}>
          Delete
        </BulkBarButton>
      </CardBulkBar>

      <GroupedCardList
        cards={cards}
        schedulingConfig={schedulingConfig}
        selectMode={selectMode}
        selected={selected}
        expandedCardId={expandedCardId}
        onToggle={toggle}
        onToggleExpand={setExpandedCardId}
        onEditCard={onEditCard}
        onResume={handleResume}
        onDelete={handleDeleteOne}
        onToggleFlag={handleToggleFlag}
        linkedCardIds={linkedCardIds}
        onUnlinkCard={onUnlinkCard}
        motionMultiplier={m}
        compactMetadata={compactMetadata}
        sequences={sequences}
        onEditSequence={onEditSequence}
        occlusions={occlusions}
        onEditOcclusion={onEditOcclusion}
      />
    </div>
  );
}
