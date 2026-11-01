import { useCallback, useMemo, useRef, useState } from 'react';
import { useToast } from '../ui/Toast';
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
import type { Card } from '@lacuna/core/db/types';
import { countOf } from '../../utils/plural';

/** A lesson a card can be bulk-assigned to, offered in the "Assign to lesson…" panel. */
export interface AssignableLesson {
  id: string;
  name: string;
}

export function useCardListActions({
  cards,
  linkedCardIds,
  assignableLessons,
  courseId,
}: {
  cards: Card[];
  linkedCardIds?: ReadonlySet<string>;
  assignableLessons?: AssignableLesson[];
  courseId?: string;
}) {
  const { notify } = useToast();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagging, setTagging] = useState(false);
  const [tagValue, setTagValue] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState<'new' | 'dueNow'>('new');
  const [assigningLesson, setAssigningLesson] = useState(false);
  // Sentinel '' means "Unassigned" (primaryLessonId null); otherwise a lesson id.
  const [assignTarget, setAssignTarget] = useState<string>('');
  // Existing tags across the deck, offered as suggestions in the bulk tag panel.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) for (const t of c.tags ?? []) set.add(t);
    return [...set].sort();
  }, [cards]);

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

  // A finished bulk action closes the bar it was chosen from; focus returns to Select.
  const selectButton = useRef<HTMLButtonElement>(null);
  function finishBulk() {
    exitSelect();
    requestAnimationFrame(() => selectButton.current?.focus({ preventScroll: true }));
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
      finishBulk();
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
      finishBulk();
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
    finishBulk();
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
      try {
        const snapshot = await snapshotCards([id]);
        await deleteCards([id]);
        notify('Card deleted.', 'neutral', {
          actionLabel: 'Undo',
          onAction: () => {
            void restoreCards(snapshot);
          },
        });
      } catch {
        notify('Could not delete the card.', 'negative');
      }
    },
    [notify],
  );

  return {
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
  };
}
