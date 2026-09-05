import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, m as motion, useMotionValue, useSpring } from 'motion/react';
import { Button } from '../ui/Button';
import { Menu, type MenuItem } from '../ui/Menu';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import { UnifiedImportPanel } from '../import/UnifiedImportPanel';
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
} from '../../db/repository';
import { isLeech } from '../../fsrs/leech';
import {
  CheckIcon,
  CloseIcon,
  EditIcon,
  FlagIcon,
  MoreIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
} from '../ui/icons';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useIsTouchMode } from '../../state/inputMode';
import { useVirtualList } from '../../hooks/useVirtualList';
import { sequenceForItemId } from '../../db/sequenceGeneration';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import { GeneratedCardGroup } from './GeneratedCardGroup';
import { GeneratedCardBadge } from './GeneratedCardBadge';
import type { ParsedCard } from '../../db/import';
import type { ApkgImportResult } from '../../db/apkgImport';
import type { Card, Occlusion, SchedulerConfig, Sequence } from '../../db/types';
import type { CardListContext } from './cardListContext';

const CardContent = lazy(() =>
  import('./CardContent').then((module) => ({ default: module.CardContent })),
);
const CardAnalytics = lazy(() =>
  import('./CardAnalytics').then((module) => ({ default: module.CardAnalytics })),
);

/** A lesson a card can be bulk-assigned to, offered in the "Assign to lesson…" panel. */
interface AssignableLesson {
  id: string;
  name: string;
}

interface CardListBaseProps {
  cards: Card[];
  onNewCard?: () => void;
  /** Sibling to onNewCard: offers "New sequence" alongside "New card" when supplied. */
  onNewSequence?: () => void;
  /** Offers an image-occlusion editor alongside the other authoring controls. */
  onNewOcclusion?: () => void;
  /** Opens a picker for adding existing course cards to this lesson without moving them. */
  onLinkExisting?: () => void;
  onEditCard: (card: Card) => void;
  /** When true, suppresses the internal "Cards (N)" heading row. */
  hideHeader?: boolean;
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

export function CardList({ cards, context, onNewCard, onNewSequence, onNewOcclusion, onLinkExisting, onEditCard, hideHeader = false, initiallyImporting = false, assignableLessons, courseId, sequences, onEditSequence, occlusions, onEditOcclusion, linkedCardIds, onUnlinkCard }: CardListProps) {
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
        const occlusion = occlusions ? occlusionForRegionId(occlusions, card.occlusionRegionId) : undefined;
        if (!occlusion) continue;
        const key = `occlusion:${occlusion.id}`;
        const group = byOwner.get(key) ?? { kind: 'occlusion', owner: occlusion, cards: [] };
        group.cards.push(card);
        byOwner.set(key, group);
      }
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

  function toggleAll() {
    setSelected((prev) => {
      if (selectableCards.length > 0 && selectableCards.every((c) => prev.has(c.id))) return new Set();
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
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const snapshot = await snapshotCards(ids);
    await apply(ids);
    exitSelect();
    notify(message, 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
  }

  function plural(n: number) {
    return n === 1 ? '' : 's';
  }

  async function handleSuspend(suspended: boolean) {
    const n = selected.size;
    await applyBulk(
      (ids) => setCardsSuspended(ids, suspended),
      `${n} card${plural(n)} ${suspended ? 'suspended' : 'resumed'}.`,
    );
  }

  async function handleAddTag() {
    const tag = tagValue.trim();
    if (!tag) return;
    const n = selected.size;
    await applyBulk((ids) => addTagToCards(ids, tag), `Tagged ${n} card${plural(n)} "${tag}".`);
  }

  async function handleRemoveTag() {
    const tag = tagValue.trim();
    if (!tag) return;
    const n = selected.size;
    await applyBulk(
      (ids) => removeTagFromCards(ids, tag),
      `Removed "${tag}" from ${n} card${plural(n)}.`,
    );
  }

  async function handleDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const snapshot = await snapshotCards(ids);
    await deleteCards(ids);
    exitSelect();
    notify(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted.`, 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
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
      ? assignableLessons?.find((l) => l.id === lessonId)?.name ?? 'lesson'
      : 'Unassigned';
    notify(`${ids.length} card${ids.length === 1 ? '' : 's'} assigned to ${lessonName}.`, 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
  }

  async function handleBury() {
    const n = selected.size;
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(0, 0, 0, 0);
    await applyBulk(
      (ids) => buryCards(ids, until.getTime()),
      `${n} card${plural(n)} buried until tomorrow.`,
    );
  }

  async function handleReschedule() {
    const n = selected.size;
    if (rescheduleMode === 'new') {
      await applyBulk(
        (ids) => rescheduleCards(ids, { reset: true }),
        `${n} card${plural(n)} reset to new.`,
      );
    } else {
      await applyBulk(
        (ids) => rescheduleCards(ids, { due: Date.now() }),
        `${n} card${plural(n)} made due now.`,
      );
    }
  }

  async function handleImport(cards: ParsedCard[]) {
    await context.onImport(cards);
    setImporting(false);
    notify(`${cards.length} card${cards.length === 1 ? '' : 's'} imported.`, 'positive');
  }

  async function handleApkgImport(result: ApkgImportResult) {
    await context.onApkgImport(result);
    setImporting(false);
    notify(`${result.cards.length} card${result.cards.length === 1 ? '' : 's'} imported from Anki.`, 'positive');
  }

  const handleResume = useCallback(async (card: Card) => {
    const snapshot = await snapshotCards([card.id]);
    await unsuspendCard(card.id);
    notify('Card resumed.', 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
  }, [notify]);

  const handleToggleFlag = useCallback(async (card: Card) => {
    const snapshot = await snapshotCards([card.id]);
    await setCardFlag(card.id, !card.flagged);
    notify(card.flagged ? 'Flag removed.' : 'Card flagged.', 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
  }, [notify]);

  // One-click delete from a card's hover actions, with the same snapshot/undo flow
  // as the bulk selection delete.
  const handleDeleteOne = useCallback(async (id: string) => {
    const snapshot = await snapshotCards([id]);
    await deleteCards([id]);
    notify('Card deleted.', 'neutral', {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreCards(snapshot);
      },
    });
  }, [notify]);

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
      <div className={cn('mb-4 flex flex-wrap items-center gap-2', hideHeader && 'justify-end')}>
        {!hideHeader && (
          <h2 className="font-display text-2xl">
            Cards <span className="text-ink-faint">({cards.length})</span>
          </h2>
        )}
        <div className={cn('flex items-center gap-2', !hideHeader && 'ml-auto')}>
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
            <Button variant="primary" size="sm" onClick={onNewCard}>
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

      {/* Inline import panel */}
      <AnimatePresence>
        {importing && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4"
          >
            <div className="rounded-2xl border border-line-strong bg-surface p-5">
              <h3 className="mb-1 font-display text-lg">Import cards into {importTargetName}</h3>
              <p className="mb-4 text-sm text-ink-soft">
                Paste card text or upload CSV, JSON or an Anki APKG. This adds cards; it does not
                restore a full Lacuna backup or import a shared course.
              </p>
              <UnifiedImportPanel
                deckId={context.importTargetId}
                onImport={handleImport}
                onCancel={() => setImporting(false)}
                importLabel="Add cards"
                onApkgImport={handleApkgImport}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectMode && (
        <div className="mb-4 rounded-xl border border-line-strong bg-surface px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              aria-pressed={selectableCards.length > 0 && selectableCards.every((c) => selected.has(c.id))}
              className="flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full border transition-colors',
                  selectableCards.length > 0 && selectableCards.every((c) => selected.has(c.id))
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-line-strong',
                )}
              >
                {selectableCards.length > 0 && selectableCards.every((c) => selected.has(c.id)) && (
                  <CheckIcon width={12} height={12} />
                )}
              </span>
              {selectableCards.length > 0 && selectableCards.every((c) => selected.has(c.id)) ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-sm text-ink-faint">{selected.size} selected</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={tagging ? 'primary' : 'secondary'}
                disabled={selected.size === 0}
                onClick={() => (tagging ? setTagging(false) : startTag())}
              >
                Tag…
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selected.size === 0}
                onClick={() => handleSuspend(true)}
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selected.size === 0}
                onClick={() => handleSuspend(false)}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selected.size === 0}
                onClick={handleBury}
              >
                Bury
              </Button>
              <Button
                size="sm"
                variant={rescheduling ? 'primary' : 'secondary'}
                disabled={selected.size === 0}
                onClick={() => (rescheduling ? setRescheduling(false) : startReschedule())}
              >
                Reschedule…
              </Button>
              {assignableLessons && courseId && (
                <Button
                  size="sm"
                  variant={assigningLesson ? 'primary' : 'secondary'}
                  disabled={selected.size === 0}
                  onClick={() => (assigningLesson ? setAssigningLesson(false) : startAssignLesson())}
                >
                  Assign to lesson…
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                disabled={selected.size === 0}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          </div>

          {/* Inline tag chooser */}
          <AnimatePresence>
            {tagging && selected.size > 0 && (
              <motion.div
                initial={m > 0 ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={m > 0 ? { opacity: 0 } : undefined}
                transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                className="mt-3"
              >
                <div className="border-t border-line pt-3">
                  <label className="block text-sm text-ink-soft">
                    Tag for {selected.size} card{plural(selected.size)}
                    <input
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
                className="mt-3"
              >
                <div className="border-t border-line pt-3">
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm text-ink-soft">
                      Reschedule {selected.size} card{plural(selected.size)}
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
                className="mt-3"
              >
                <div className="border-t border-line pt-3">
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
        </div>
      )}

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

/** Rows stagger by this much, up to STAGGER_CAP_S, so a full window still lands quickly. */
const STAGGER_STEP_S = 0.03;
const STAGGER_CAP_S = 0.25;

function cardTypeLabel(card: Card) {
  if (card.sequenceItemId !== null && card.sequenceItemId !== undefined) return 'Sequence';
  if (card.payload?.kind === 'working') return 'Working';
  return card.type === 'cloze' ? 'Cloze' : 'Front / Back';
}

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
}) {
  const enabled = cards.length > VIRTUAL_THRESHOLD;
  const { totalHeight, virtualItems, measureRef, containerRef } = useVirtualList({
    itemCount: cards.length,
    estimateSize: 100,
    gap: 12,
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
      <div className="grid gap-3">
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
            onToggleExpand={() =>
              onToggleExpand((prev) => (prev === card.id ? null : card.id))
            }
            onEdit={() => onEditCard(card)}
            onResume={() => onResume(card)}
            onDelete={() => onDelete(card.id)}
            linked={linkedCardIds?.has(card.id) === true}
            onUnlink={() => onUnlinkCard?.(card)}
            onToggleFlag={onToggleFlag}
            motionMultiplier={motionMultiplier}
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
              onToggleExpand={() =>
                onToggleExpand((prev) => (prev === card.id ? null : card.id))
              }
              onEdit={() => onEditCard(card)}
              onResume={() => onResume(card)}
              onDelete={() => onDelete(card.id)}
              linked={linkedCardIds?.has(card.id) === true}
              onUnlink={() => onUnlinkCard?.(card)}
              onToggleFlag={onToggleFlag}
              motionMultiplier={motionMultiplier}
              skipAnimation={introDone}
            />
          </div>
        );
      })}
    </div>
  );
}

const CardRow = React.memo(function CardRow({
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
}) {
  const [hovered, setHovered] = useState(false);
  const m = motionMultiplier ?? 1;
  const isTouchMode = useIsTouchMode();
  const showBack = hovered;

  // Lazy-render: only parse the back side when it is actually visible.
  const contentSide = useMemo(() => (showBack ? 'back' : 'front'), [showBack]);

  const reviewed = card.lastReviewed !== null;
  const tags = card.tags ?? [];
  const buried = card.buriedUntil !== null && card.buriedUntil !== undefined && card.buriedUntil > Date.now();
  const leech = isLeech(card);
  const flagged = card.flagged === true;
  // Generated cards are owned by their Sequence or Occlusion: content edits and deletes
  // happen there, never here, so selection and deletion are suppressed regardless of
  // selectMode/hover. Scheduling actions (flag/suspend/bury/reschedule/resume) stay fully
  // available.
  const isSequenceGenerated = card.sequenceItemId !== null && card.sequenceItemId !== undefined;
  const isOcclusionGenerated = card.occlusionRegionId !== null && card.occlusionRegionId !== undefined;
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (selectMode || expanded) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    e.stopPropagation();
    swipeState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      isSwipe: false,
      openBeforeDrag: trayOpenRef.current,
    };
    cardRef.current?.setPointerCapture(e.pointerId);
  }, [selectMode, expanded]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
  }, [dragX, isTouchMode]);

  const justHandledTap = useRef(false);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
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
    } else {        // It was a tap — close the tray if it is open; suppress the subsequent click.
      if (trayOpenRef.current) {
        hapticLight();
        justHandledTap.current = true;
        setTrayOpen(false);
        dragX.set(0);
      }
    }
  }, [dragX, isTouchMode, onToggleFlag]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    cardRef.current?.releasePointerCapture(e.pointerId);
    swipeState.current.dragging = false;
    swipeState.current.isSwipe = false;
    dragX.set(trayOpenRef.current ? -trayWidth : 0);
  }, [dragX]);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selectMode && !generated && !linked) {
        onToggle();
      } else {
        onToggleExpand();
      }
    }
  }, [selectMode, generated, linked, onToggle, onToggleExpand]);

  const handleMouseEnter = useCallback(() => {
    if (!selectMode) setHovered(true);
  }, [selectMode]);

  const handleMouseLeave = useCallback(() => {
    if (!selectMode) setHovered(false);
  }, [selectMode]);

  const handleFlagClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    hapticLight();
    onToggleFlag(cardRefForCallback.current);
  }, [onToggleFlag]);

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    hapticLight();
    onEdit();
  }, [onEdit]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    hapticMedium();
    onDelete();
  }, [onDelete]);

  const handleUnlinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    hapticLight();
    onUnlink();
  }, [onUnlink]);

  const handleResumeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onResume();
  }, [onResume]);

  const handleFlagHoverClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFlag(cardRefForCallback.current);
  }, [onToggleFlag]);

  const handleExpandedClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-surface transition-colors duration-200',
        selected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-line hover:border-line-strong',
      )}
    >
      {/* Action tray revealed behind the card on swipe-left */}
      <div
        className="absolute inset-y-0 right-0 z-0 flex items-center overflow-hidden rounded-r-xl"
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
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        tabIndex={0}
        aria-expanded={expanded}
        className={cn(
          'relative z-10 cursor-pointer rounded-xl border bg-surface p-4',
          selected
            ? 'border-accent ring-2 ring-accent/30'
            : 'border-line hover:border-line-strong hover:shadow-md hover:shadow-black/[0.03] active:bg-ink/5',
        )}
      >
        <div className="flex items-start gap-4">
          {selectMode && !generated && !linked && (
            <span
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                selected ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
              )}
            >
              {selected && <CheckIcon width={12} height={12} />}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-ink/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-faint">
                {cardTypeLabel(card)}
              </span>
              {showBack && (
                <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  Back
                </span>
              )}
              {reviewed ? (
                <span className="text-[11px] text-ink-faint tabular">
                  Stability {card.stability!.toFixed(1)}d
                </span>
              ) : (
                <span className="text-[11px] text-accent">New</span>
              )}
              {card.suspended && (
                <span className="rounded-lg bg-ink/5 px-2 py-0.5 text-[11px] text-ink-faint">
                  Suspended
                </span>
              )}
              {!card.suspended && buried && (
                <span className="rounded-lg bg-ink/5 px-2 py-0.5 text-[11px] text-ink-faint">
                  Buried
                </span>
              )}
              {leech && (
                <span
                  title={`Failed ${card.lapses} times — consider rewording or splitting this card.`}
                  className="rounded-lg bg-negative/10 px-2 py-0.5 text-[11px] font-medium text-negative"
                >
                  Leech
                </span>
              )}
              {flagged && <FlagIcon width={13} height={13} className="text-accent" />}
              {generated && !isSequenceGenerated && (
                <GeneratedCardBadge kind="occlusion" />
              )}
              {linked && (
                <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  Linked
                </span>
              )}
            </div>
            <div className="relative max-h-24 overflow-hidden text-sm text-ink-soft [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={showBack ? 'back' : 'front'}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 * m }}
                >
                  <Suspense fallback={<span className="inline-block h-4 w-24 animate-pulse rounded bg-ink/5" />}>
                    <CardContent card={card} side={contentSide} />
                  </Suspense>
                </motion.div>
              </AnimatePresence>
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

          {!selectMode && (
            <div className="flex shrink-0 items-center gap-1">
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
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.08 }}
                className={cn(
                  'min-h-11 rounded-lg p-2 transition-opacity hover:bg-ink/5 hover:text-accent focus-visible:opacity-100 touch-visible',
                  flagged
                    ? 'text-accent opacity-100'
                    : 'text-ink-faint opacity-0 group-hover:opacity-100',
                )}
              >
                <FlagIcon width={16} height={16} />
              </motion.button>
              <motion.button
                type="button"
                onClick={handleEditClick}
                title="Edit card"
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.08 }}
                className="min-h-11 rounded-lg p-2 text-ink-faint opacity-0 transition-opacity hover:bg-ink/5 hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 touch-visible"
              >
                <EditIcon width={16} height={16} />
              </motion.button>
              {removable && (
              <motion.button
                type="button"
                onClick={linked ? handleUnlinkClick : handleDeleteClick}
                title={linked ? 'Remove from lesson' : 'Delete card'}
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.08 }}
                className={cn(
                  'min-h-11 rounded-lg p-2 text-ink-faint opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 touch-visible',
                  linked
                    ? 'hover:bg-ink/5 hover:text-ink'
                    : 'hover:bg-negative/10 hover:text-negative',
                )}
              >
                {linked ? <CloseIcon width={16} height={16} /> : <TrashIcon width={16} height={16} />}
              </motion.button>
              )}
            </div>
          )}
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4"
              onClick={handleExpandedClick}
            >
              <div className="border-t border-line pt-4">
                <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-ink/[0.03]" />}>
                  <CardAnalytics
                    card={card}
                    schedulingConfig={schedulingConfig}
                    motionMultiplier={m}
                  />
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
