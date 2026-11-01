// Rename, move and delete for one lesson, from a visible "Lesson actions" trigger or the
// context-menu gestures on the lesson it belongs to (see lessonContextMenu). Shared by
// the lesson heading and the course path rows. Deletion reuses deleteLesson, which
// removes notes and unassigns cards, and offers Undo from the lesson's snapshot.

import { useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  deleteLesson,
  restoreLesson,
  snapshotLesson,
  updateLesson,
} from '../../db/lessonRepository';
import type { Lesson } from '../../db/types';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { Field, Input } from '../ui/Field';
import { ChevronDownIcon, EditIcon, MoreIcon, TrashIcon } from '../ui/icons';
import { Menu, type MenuHandle } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import { contextMenuHandlers } from '../ui/contextMenu';
import { countOf } from '../../utils/plural';

/**
 * Right-click, the context-menu key and Shift+F10 on the element these handlers are
 * spread onto open the lesson's actions menu instead of the browser's.
 */
export function lessonContextMenu(menu: () => MenuHandle | null | undefined) {
  return contextMenuHandlers(() => menu()?.open);
}

/**
 * After a deletion re-renders the course, move focus to the first match of `selector`
 * once it exists (a following path row, else the page heading), so it never falls to
 * the document body.
 */
export function focusAfterLessonDeletion(selectors: string[]) {
  let frames = 0;
  // Keep watching for about a second: the first match can belong to a page that is
  // still leaving, so focus is re-targeted whenever it falls back to the body.
  const attempt = () => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      for (const selector of selectors) {
        const target = document.querySelector<HTMLElement>(selector);
        if (!target || target.closest('[inert]')) continue;
        if (target.tabIndex < 0 && !target.hasAttribute('tabindex'))
          target.setAttribute('tabindex', '-1');
        target.focus();
        if (document.activeElement === target) break;
      }
    }
    if ((frames += 1) < 60) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

interface LessonActionsMenuProps {
  lesson: Lesson;
  /** Index of the lesson in course order and the number of lessons. */
  position: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  /** Starts an in-place rename; without it, Rename opens a small dialog. */
  onRename?: () => void;
  /** Called once the lesson has been deleted, before Undo is offered. */
  onDeleted?: () => void;
  handle?: Ref<MenuHandle>;
}

export function LessonActionsMenu({
  lesson,
  position,
  count,
  onMove,
  onRename,
  onDeleted,
  handle,
}: LessonActionsMenuProps) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  return (
    <>
      <Menu
        label={`Lesson actions: ${lesson.name}`}
        triggerWidth={44}
        handle={handle}
        items={[
          {
            label: 'Rename',
            icon: <EditIcon width={16} height={16} />,
            onSelect: () => (onRename ? onRename() : setDialog('rename')),
          },
          {
            label: 'Move up',
            icon: <ChevronDownIcon width={16} height={16} className="rotate-180" />,
            disabled: position <= 0,
            onSelect: () => onMove(-1),
          },
          {
            label: 'Move down',
            icon: <ChevronDownIcon width={16} height={16} />,
            disabled: position >= count - 1,
            onSelect: () => onMove(1),
          },
          {
            label: 'Delete lesson',
            icon: <TrashIcon width={16} height={16} />,
            onSelect: () => setDialog('delete'),
          },
        ]}
      >
        <MoreIcon width={18} height={18} />
      </Menu>
      {dialog &&
        createPortal(
          dialog === 'rename' ? (
            <RenameLessonDialog lesson={lesson} onClose={() => setDialog(null)} />
          ) : (
            <DeleteLessonDialog
              lesson={lesson}
              onClose={() => setDialog(null)}
              onDeleted={() => {
                setDialog(null);
                onDeleted?.();
              }}
            />
          ),
          document.body,
        )}
    </>
  );
}

function RenameLessonDialog({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'input' });
  const [name, setName] = useState(lesson.name);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    if (trimmed === lesson.name) return onClose();
    setSaving(true);
    try {
      await updateLesson(lesson.id, { name: trimmed });
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not rename the lesson.', 'negative');
      setSaving(false);
    }
  }
  return (
    <DialogPanel
      label="Rename lesson"
      trapRef={trapRef}
      onBackdropClick={onClose}
      className="max-w-md"
      onKeyDown={dialogKeyDown({
        onCancel: onClose,
        onSubmit: () => void save(),
        enterSubmits: true,
      })}
    >
      <DialogHeader title="Rename lesson" onClose={onClose} closeLabel="Close" />
      <div className="px-6 py-5">
        <Field label="Lesson name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            disabled={saving}
          />
        </Field>
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving || !name.trim()}>
          Rename
        </Button>
      </footer>
    </DialogPanel>
  );
}

/** What deleteLesson removes and what it keeps, in the learner's terms. */
export function lessonDeletionConsequence(noteCount: number, cardCount: number): string {
  const notes =
    noteCount > 0 ? `Its ${countOf(noteCount, 'note')} will be deleted.` : 'It has no notes.';
  const cards =
    cardCount > 0
      ? `Its ${countOf(cardCount, 'card')} ${cardCount === 1 ? 'stays' : 'stay'} in the course without a lesson.`
      : 'It has no cards.';
  return `${notes} ${cards}`;
}

function DeleteLessonDialog({
  lesson,
  onClose,
  onDeleted,
}: {
  lesson: Lesson;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-cancel]' });
  const { notify } = useToast();
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const counts = useLiveQuery(
    async () => ({
      notes: await db.notes.where('lessonId').equals(lesson.id).count(),
      // Cards belong to a lesson by primary assignment or by link, as useLessonCards reads them.
      cards: new Set([
        ...(await db.cards.where('primaryLessonId').equals(lesson.id).primaryKeys()),
        ...(await db.lessonCards.where('lessonId').equals(lesson.id).toArray()).map(
          (link) => link.cardId,
        ),
      ]).size,
    }),
    [lesson.id],
  );
  async function confirm() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const snapshot = await snapshotLesson(lesson.id);
      await deleteLesson(lesson.id);
      onDeleted();
      notify(`${lesson.name} deleted.`, 'neutral', {
        actionLabel: 'Undo',
        replaceKey: `lesson-delete-${lesson.id}`,
        onAction: () => {
          if (!snapshot) return;
          restoreLesson(snapshot).catch(() =>
            notify('The lesson could not be restored.', 'negative'),
          );
        },
      });
    } catch (err) {
      deletingRef.current = false;
      setDeleting(false);
      notify(err instanceof Error ? err.message : 'Could not delete the lesson.', 'negative');
    }
  }
  return (
    <DialogPanel
      label={`Delete ${lesson.name}?`}
      trapRef={trapRef}
      onBackdropClick={onClose}
      className="max-w-md"
      onKeyDown={dialogKeyDown({ onCancel: onClose })}
    >
      <DialogHeader title={`Delete ${lesson.name}?`} onClose={onClose} closeLabel="Close" />
      <p className="px-6 py-5 text-sm text-ink-soft" aria-live="polite">
        {counts ? lessonDeletionConsequence(counts.notes, counts.cards) : ' '}
      </p>
      <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" data-cancel onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={deleting || !counts}>
          Delete lesson
        </Button>
      </footer>
    </DialogPanel>
  );
}
