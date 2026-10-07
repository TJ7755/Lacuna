import { Input } from '../ui/Field';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '../ui/Button';
import { Menu, type MenuItem } from '../ui/Menu';
import { SelectedCardsAnswerMode } from './AnswerModeControl';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';
import { CardImportDialog } from '../import/CardImportDialog';
import { importCardCount, type CardImportContent } from '../../db/cardImport';
import {
  addTagToCards,
  assignCardsToLesson,
  buryCards,
  deleteCards,
  removeTagFromCards,
  rescheduleCards,
  restoreCards,
  setCardFlag,
  setCardsSuspended,
  snapshotCards,
  unsuspendCard,
} from '../../db/cardRepository';
import {
  CheckIcon,
  MoreIcon,
  PlusIcon,
  UploadIcon,
} from '../ui/icons';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useVirtualList } from '../../hooks/useVirtualList';
import { sequenceForItemId } from '../../db/sequenceGeneration';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import { GeneratedCardGroup } from './GeneratedCardGroup';
import type { Card, Occlusion, SchedulerConfig, Sequence } from '../../db/types';
import type { CardListContext } from './cardListContext';
import { BulkBarButton, CardBulkBar } from './CardBulkBar';
import { CardRow } from './CardRow';
import { countOf } from '../../utils/plural';

/** A lesson a card can be bulk-assigned to, offered in the "Assign to lesson…" panel. */
interface AssignableLesson {
  id: string;
  name: string;
}

interface CardListBaseProps {
  cards: Card[];
  onNewCard?: () => void;
  /** Draw New card as a secondary action, for pages whose own header holds the primary one. */
  quietNewCard?: boolean;
  /** Sibling to onNewCard: offers "New sequence" alongside "New card" when supplied. */
  onNewSequence?: () => void;
  /** Offers an image-occlusion editor alongside the other authoring controls. */
  onNewOcclusion?: () => void;
  /** Opens a picker for adding existing course cards to this lesson without moving them. */
  onLinkExisting?: () => void;
  onEditCard: (card: Card) => void;
  /** When true, suppresses the internal "Cards (N)" heading row. */
  hideHeader?: boolean;
  /** Replaces the default heading, sharing its row with the list's actions. */
  heading?: React.ReactNode;
  /** Keeps the heading row in view below the course bar while its cards scroll past. */
  stickyHeader?: boolean;
  /** Opens the card importer on first mount. */
  initiallyImporting?: boolean;
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
  onNewCard,
  quietNewCard = false,
  onNewSequence,
  onNewOcclusion,
  onLinkExisting,
  onEditCard,
  hideHeader = false,
  heading,
  stickyHeader = false,
  initiallyImporting = false,
  assignableLessons,
  courseId,
  sequences,
  onEditSequence,
  occlusions,
  onEditOcclusion,
  linkedCardIds,
  onUnlinkCard,
}: CardListProps) {
  const { notify } = useToast();
  const schedulingConfig = context.schedulingConfig;
  const importTargetName = context.importTargetName;
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagging, setTagging] = useState(false);
  const [tagValue, setTagValue] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState<'new' | 'dueNow'>('new');
  const [assigningLesson, setAssigningLesson] = useState(false);
  // Sentinel '' means "Unassigned" (primaryLessonId null); otherwise a lesson id.
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [importing, setImporting] = useState(initiallyImporting);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  useEffect(() => {
    setExpandedCardId(null);
  }, [schedulingConfig.id]);

  // Existing tags across the deck, offered as suggestions in the bulk tag panel.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) for (const t of c.tags ?? []) set.add(t);
    return [...set].sort();
  }, [cards]);

  // Generated cards (a sequence item ID or an occlusion region ID) are managed exclusively
  // from their owning sequence/occlusion: they never take part in bulk selection
  // (Tag/Suspend/Delete/…), since content edits and deletes would desync or fight
  // with the next regeneration. Grouping them under a header naming their owner is purely
  // presentational — every card still flows through the same CardListBody/CardRow, which
  // independently enforces the read-only treatment (no checkbox, no delete) from
  // `card.sequenceItemId`/`card.occlusionRegionId` itself.
  interface GeneratedGroup {
    kind: 'sequence' | 'occlusion';
    owner: { id: string; name: string };
    cards: Card[];
  }
  const generatedGroups = useMemo(() => {
    const byOwner = new Map<string, GeneratedGroup>();
    for (const card of cards) {
      if (card.sequenceItemId !== null && card.sequenceItemId !== undefined) {
        const sequence = sequences ? sequenceForItemId(sequences, card.sequenceItemId) : undefined;
        if (!sequence) continue;
        const key = `sequence:${sequence.id}`;
        const group = byOwner.get(key) ?? { kind: 'sequence', owner: sequence, cards: [] };
        group.cards.push(card);
        byOwner.set(key, group);
      } else if (card.occlusionRegionId !== null && card.occlusionRegionId !== undefined) {
        const occlusion = occlusions
          ? occlusionForRegionId(occlusions, card.occlusionRegionId)
          : undefined;
        if (!occlusion) continue;
        const key = `occlusion:${occlusion.id}`;
        const group = byOwner.get(key) ?? { kind: 'occlusion', owner: occlusion, cards: [] };
        group.cards.push(card);
        byOwner.set(key, group);
      }
    }
    // An occlusion's cards follow its regions, so "Label 1 of 4" comes first.
    for (const group of byOwner.values()) {
      if (group.kind !== 'occlusion') continue;
      const order = new Map((group.owner as Occlusion).regions.map((region, i) => [region.id, i]));
      group.cards.sort(
        (a, b) => (order.get(a.occlusionRegionId!) ?? 0) - (order.get(b.occlusionRegionId!) ?? 0),
      );
    }
    return [...byOwner.values()];
  }, [cards, sequences, occlusions]);

  const groupedCardIds = useMemo(
    () => new Set(generatedGroups.flatMap((g) => g.cards.map((c) => c.id))),
    [generatedGroups],
  );
  // Every card not shown under a group heading: ordinary cards plus any generated card
  // whose owning sequence/occlusion could not be resolved (defensive fallback — still
  // badged/read-only via CardRow, just without a group header to sit under).
  const looseCards = useMemo(
    () => cards.filter((c) => !groupedCardIds.has(c.id)),
    [cards, groupedCardIds],
  );
  // Bulk selection only ever applies to ordinary (non-generated) cards.
  const selectableCards = useMemo(
    () =>
      cards.filter(
        (c) =>
          (c.sequenceItemId === null || c.sequenceItemId === undefined) &&
          (c.occlusionRegionId === null || c.occlusionRegionId === undefined) &&
          !linkedCardIds?.has(c.id),
      ),
    [cards, linkedCardIds],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allSelected =
    selectableCards.length > 0 && selectableCards.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected((prev) => {
      if (selectableCards.length > 0 && selectableCards.every((c) => prev.has(c.id)))
        return new Set();
      return new Set(selectableCards.map((c) => c.id));
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setTagging(false);
    setTagValue('');
    setRescheduling(false);
    setRescheduleMode('new');
    setAssigningLesson(false);
    setAssignTarget('');
  }

  /** Apply a reversible bulk change to the selected cards, with an Undo toast. */
  async function applyBulk(
    apply: (ids: string[]) => Promise<void>,
    message: string,
    failure: string,
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const snapshot = await snapshotCards(ids);
      await apply(ids);
      exitSelect();
      notify(message, 'neutral', { actionLabel: 'Undo', onAction: () => undoRestore(snapshot) });
    } catch {
      // Selection stays intact so the learner can retry.
      notify(failure, 'negative');
    }
  }

  /** Undo handler: a failed restore is reported rather than escaping as an unhandled rejection. */
  function undoRestore(snapshot: Awaited<ReturnType<typeof snapshotCards>>) {
    restoreCards(snapshot).catch(() => notify('Could not undo that change.', 'negative'));
  }

  async function handleSuspend(suspended: boolean) {
    const n = selected.size;
    await applyBulk(
      (ids) => setCardsSuspended(ids, suspended),
      `${countOf(n, 'card')} ${suspended ? 'suspended' : 'resumed'}.`,
      `Could not ${suspended ? 'suspend' : 'resume'} the selected cards.`,
    );
  }

  async function handleAddTag() {
    const tag = tagValue.trim();
    if (!tag) return;
    const n = selected.size;
    await applyBulk(
      (ids) => addTagToCards(ids, tag),
      `Tagged ${countOf(n, 'card')} "${tag}".`,
      'Could not tag the selected cards.',
    );
  }

  async function handleRemoveTag() {
    const tag = tagValue.trim();
    if (!tag) return;
    const n = selected.size;
    await applyBulk(
      (ids) => removeTagFromCards(ids, tag),
      `Removed "${tag}" from ${countOf(n, 'card')}.`,
      'Could not remove the tag from the selected cards.',
    );
  }

  async function handleDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const snapshot = await snapshotCards(ids);
      await deleteCards(ids);
      exitSelect();
      notify(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted.`, 'neutral', {
        actionLabel: 'Undo',
        onAction: () => undoRestore(snapshot),
      });
    } catch {
      notify('Could not delete the selected cards.', 'negative');
    }
  }

  function startTag() {
    setRescheduling(false);
    setAssigningLesson(false);
    setTagging(true);
  }

  function startReschedule() {
    setTagging(false);
    setAssigningLesson(false);
    setRescheduling(true);
  }

  function startAssignLesson() {
    setTagging(false);
    setRescheduling(false);
    setAssignTarget(assignableLessons?.[0]?.id ?? '');
    setAssigningLesson(true);
  }

  async function handleAssignLesson() {
    if (!courseId) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    const snapshot = await snapshotCards(ids);
    const lessonId = assignTarget || null;
    await assignCardsToLesson(ids, courseId, lessonId);
    exitSelect();
    const lessonName = lessonId
      ? (assignableLessons?.find((l) => l.id === lessonId)?.name ?? 'lesson')
      : 'Unassigned';
    notify(
      `${ids.length} card${ids.length === 1 ? '' : 's'} assigned to ${lessonName}.`,
      'neutral',
      {
        actionLabel: 'Undo',
        onAction: () => {
          void restoreCards(snapshot);
        },
      },
    );
  }

  async function handleBury() {
    const n = selected.size;
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(0, 0, 0, 0);
    await applyBulk(
      (ids) => buryCards(ids, until.getTime()),
      `${countOf(n, 'card')} buried until tomorrow.`,
      'Could not bury the selected cards.',
    );
  }

  async function handleReschedule() {
    const n = selected.size;
    if (rescheduleMode === 'new') {
      await applyBulk(
        (ids) => rescheduleCards(ids, { reset: true }),
        `${countOf(n, 'card')} reset to new.`,
        'Could not reset the selected cards.',
      );
    } else {
      await applyBulk(
        (ids) => rescheduleCards(ids, { due: Date.now() }),
        `${countOf(n, 'card')} made due now.`,
        'Could not reschedule the selected cards.',
      );
    }
  }

  async function handleCardImport(content: CardImportContent) {
    if (content.kind === 'apkg') await context.onApkgImport(content.result);
    else await context.onImport(content.cards, content.reverse);
    setImporting(false);
    const count = importCardCount(content);
    notify(`${count} card${count === 1 ? '' : 's'} imported.`, 'positive');
  }

  const handleResume = useCallback(
    async (card: Card) => {
      const snapshot = await snapshotCards([card.id]);
      await unsuspendCard(card.id);
      notify('Card resumed.', 'neutral', {
        actionLabel: 'Undo',
        onAction: () => {
          void restoreCards(snapshot);
        },
      });
    },
    [notify],
  );

  const handleToggleFlag = useCallback(
    async (card: Card) => {
      const snapshot = await snapshotCards([card.id]);
      await setCardFlag(card.id, !card.flagged);
      notify(card.flagged ? 'Flag removed.' : 'Card flagged.', 'neutral', {
        actionLabel: 'Undo',
        onAction: () => {
          void restoreCards(snapshot);
        },
      });
    },
    [notify],
  );

  // One-click delete from a card's hover actions, with the same snapshot/undo flow
  // as the bulk selection delete.
  const handleDeleteOne = useCallback(
    async (id: string) => {
      const snapshot = await snapshotCards([id]);
      await deleteCards([id]);
      notify('Card deleted.', 'neutral', {
        actionLabel: 'Undo',
        onAction: () => {
          void restoreCards(snapshot);
        },
      });
    },
    [notify],
  );

  // Everything except "New card". Built from the callbacks the caller actually supplied, so a
  // context that cannot make sequences simply has one fewer entry rather than a dead control.
  const addMenuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (onNewSequence) {
      items.push({
        label: 'New sequence',
        icon: <PlusIcon width={16} height={16} />,
        onSelect: onNewSequence,
      });
    }
    if (onNewOcclusion) {
      items.push({
        label: 'New occlusion',
        icon: <PlusIcon width={16} height={16} />,
        onSelect: onNewOcclusion,
      });
    }
    if (onLinkExisting) {
      items.push({
        label: 'Link existing cards',
        icon: <PlusIcon width={16} height={16} />,
        onSelect: onLinkExisting,
      });
    }
    if (!selectMode) {
      items.push({
        label: importing ? 'Hide import panel' : 'Import cards',
        icon: <UploadIcon width={16} height={16} />,
        onSelect: () => setImporting((v) => !v),
      });
    }
    return items;
  }, [onNewSequence, onNewOcclusion, onLinkExisting, selectMode, importing]);

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
          {onNewCard && (
            <Button variant={quietNewCard ? 'secondary' : 'primary'} size="sm" onClick={onNewCard}>
              <PlusIcon width={16} height={16} />
              New card
            </Button>
          )}
          {/*
           * The other routes to adding cards sit behind one control rather than in the row.
           * A card is what people make nearly every time; sequences, occlusions, linking and
           * importing are the occasional cases, and giving all five equal weight made the
           * header read as a toolbar dump with no primary action.
           */}
          <Menu label="More ways to add cards" items={addMenuItems}>
            <MoreIcon width={16} height={16} />
          </Menu>
        </div>
      </div>

      {importing && (
        <CardImportDialog
          targetName={importTargetName}
          schedulingUnitId={context.importTargetId}
          onCancel={() => setImporting(false)}
          onImport={handleCardImport}
        />
      )}

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
                      <label className="block text-sm text-ink-soft">
                        Tag for {countOf(selected.size, 'card')}
                        <Input
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
                          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
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
                        <legend className="mb-2 text-sm text-ink-soft">
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
                      <label className="block text-sm text-ink-soft">
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

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className={onNewCard || onNewSequence ? 'mb-4 text-ink-soft' : 'text-ink-soft'}>
            No cards yet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onNewCard && (
              <Button variant="primary" onClick={onNewCard}>
                <PlusIcon width={18} height={18} />
                New card
              </Button>
            )}
            {onNewSequence && (
              <Button variant="secondary" onClick={onNewSequence}>
                <PlusIcon width={18} height={18} />
                Add a sequence
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {generatedGroups.map((group) => (
            <GeneratedCardGroup
              key={`${group.kind}:${group.owner.id}`}
              kind={group.kind}
              owner={group.owner}
              cards={group.cards}
              schedulingConfig={schedulingConfig}
              onEditCard={onEditCard}
              onEditOwner={group.kind === 'sequence' ? onEditSequence : onEditOcclusion}
              onResume={handleResume}
              onToggleFlag={handleToggleFlag}
              linkedCardIds={linkedCardIds}
              onUnlinkCard={onUnlinkCard}
              motionMultiplier={m}
              occlusions={occlusions}
            />
          ))}
          {looseCards.length > 0 && (
            <CardListBody
              cards={looseCards}
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
              occlusions={occlusions}
            />
          )}
        </>
      )}
    </div>
  );
}

const VIRTUAL_THRESHOLD = 50;

/** Longest possible entry animation: the capped stagger plus one row's fade. */
const INTRO_WINDOW_MS = 420;


/** Renders the card list either as a simple grid (small decks) or a virtualised
 *  absolute-positioned list (large decks) to keep performance constant. Exported for
 *  reuse by {@link GeneratedCardGroup}, which renders a sequence's or occlusion's own
 *  generated cards through the same CardRow (and so gets its read-only treatment for free). */
export function CardListBody({
  cards,
  schedulingConfig,
  selectMode,
  selected,
  expandedCardId,
  onToggle,
  onToggleExpand,
  onEditCard,
  onResume,
  onDelete,
  onToggleFlag,
  linkedCardIds,
  onUnlinkCard,
  motionMultiplier,
  occlusions,
}: {
  cards: Card[];
  schedulingConfig: SchedulerConfig;
  selectMode: boolean;
  selected: Set<string>;
  expandedCardId: string | null;
  onToggle: (id: string) => void;
  onToggleExpand: React.Dispatch<React.SetStateAction<string | null>>;
  onEditCard: (card: Card) => void;
  onResume: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleFlag: (card: Card) => void;
  linkedCardIds?: ReadonlySet<string>;
  onUnlinkCard?: (card: Card) => void;
  motionMultiplier: number;
  /** Occlusions that may own these cards, so occlusion rows can show their diagram. */
  occlusions?: Occlusion[];
}) {
  const enabled = cards.length > VIRTUAL_THRESHOLD;
  const occlusionOf = (card: Card) =>
    card.occlusionRegionId !== undefined && card.occlusionRegionId !== null && occlusions
      ? occlusionForRegionId(occlusions, card.occlusionRegionId)
      : undefined;
  const { totalHeight, virtualItems, measureRef, containerRef } = useVirtualList({
    itemCount: cards.length,
    estimateSize: 100,
    gap: 4,
    overscan: 5,
    enabled,
  });

  // Cards fade in once, as the list's own entrance, and never again. Scrolling a
  // virtual window is not an entrance: rows revealed by scrolling previously
  // animated on first sight, which made the effect look arbitrary because whether
  // a given card faded depended on how far the list had been scrolled before.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    if (introDone || cards.length === 0) return;
    const id = window.setTimeout(() => setIntroDone(true), INTRO_WINDOW_MS * motionMultiplier);
    return () => window.clearTimeout(id);
  }, [introDone, cards.length, motionMultiplier]);

  if (!enabled) {
    return (
      <div className="grid gap-1">
        {cards.map((card, i) => (
          <CardRow
            key={card.id}
            card={card}
            schedulingConfig={schedulingConfig}
            staggerIndex={i}
            skipAnimation={introDone}
            selectMode={selectMode}
            selected={selected.has(card.id)}
            expanded={expandedCardId === card.id}
            onToggle={() => onToggle(card.id)}
            onToggleExpand={() => onToggleExpand((prev) => (prev === card.id ? null : card.id))}
            onEdit={() => onEditCard(card)}
            onResume={() => onResume(card)}
            onDelete={() => onDelete(card.id)}
            linked={linkedCardIds?.has(card.id) === true}
            onUnlink={() => onUnlinkCard?.(card)}
            onToggleFlag={onToggleFlag}
            motionMultiplier={motionMultiplier}
            occlusion={occlusionOf(card)}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" style={{ height: totalHeight }}>
      {virtualItems.map(({ index, start }, position) => {
        const card = cards[index];
        return (
          <div
            key={card.id}
            ref={measureRef(index)}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${start}px)` }}
          >
            <CardRow
              card={card}
              schedulingConfig={schedulingConfig}
              staggerIndex={position}
              selectMode={selectMode}
              selected={selected.has(card.id)}
              expanded={expandedCardId === card.id}
              onToggle={() => onToggle(card.id)}
              onToggleExpand={() => onToggleExpand((prev) => (prev === card.id ? null : card.id))}
              onEdit={() => onEditCard(card)}
              onResume={() => onResume(card)}
              onDelete={() => onDelete(card.id)}
              linked={linkedCardIds?.has(card.id) === true}
              onUnlink={() => onUnlinkCard?.(card)}
              onToggleFlag={onToggleFlag}
              motionMultiplier={motionMultiplier}
              skipAnimation={introDone}
              occlusion={occlusionOf(card)}
            />
          </div>
        );
      })}
    </div>
  );
}
