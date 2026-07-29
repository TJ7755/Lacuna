// A single collapsible note row within LessonView's notes section: title +
// chevron toggle, edit/delete/reorder controls, and Markdown content when
// expanded. Extracted from LessonView.tsx to keep that file focused on
// page-level composition.

import { m as motion } from 'motion/react';
import { LessonNoteEditor } from './LessonNoteEditor';
import { MarkdownView } from '../markdown/MarkdownView';
import { ChevronDownIcon, EditIcon, TrashIcon } from '../ui/icons';
import { ConfirmInline } from '../ui/ConfirmInline';
import { cn } from '../ui/cn';
import type { Note } from '../../db/types';

interface NoteRowProps {
  note: Note;
  isOpen: boolean;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  confirmingDelete: boolean;
  noteBusy: boolean;
  motionMultiplier: number;
  onToggle: () => void;
  onEdit: () => void;
  onEditSave: (data: { name: string; content: string }) => void | Promise<void>;
  onEditCancel: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function NoteRow({
  note,
  isOpen,
  isEditing,
  isFirst,
  isLast,
  confirmingDelete,
  noteBusy,
  motionMultiplier: m,
  onToggle,
  onEdit,
  onEditSave,
  onEditCancel,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onMoveUp,
  onMoveDown,
}: NoteRowProps) {
  if (isEditing) {
    return (
      <div className="p-5">
        <LessonNoteEditor
          note={note}
          onSave={onEditSave}
          onCancel={onEditCancel}
          busy={noteBusy}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Expand / collapse toggle */}
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
        >
          <motion.span
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={{ duration: 0.15 * m }}
            className="shrink-0 text-ink-faint"
          >
            <ChevronDownIcon width={14} height={14} />
          </motion.span>
          <span className="flex-1 font-medium text-ink">{note.name}</span>
        </button>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-0.5">
          {confirmingDelete ? (
            <ConfirmInline message="Delete?" onConfirm={onDeleteConfirm} onCancel={onDeleteCancel} />
          ) : (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                title="Move up"
                className={cn(
                  'flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
                  'disabled:pointer-events-none disabled:opacity-30',
                )}
              >
                <ChevronDownIcon
                  width={14}
                  height={14}
                  className="rotate-180"
                />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                title="Move down"
                className={cn(
                  'flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
                  'disabled:pointer-events-none disabled:opacity-30',
                )}
              >
                <ChevronDownIcon width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={onEdit}
                title="Edit note"
                className="flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent"
              >
                <EditIcon width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={onDeleteRequest}
                title="Delete note"
                className="flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 * m }}
          className="border-t border-line px-5 py-4"
        >
          <MarkdownView source={note.content} allowEmbeds />
        </motion.div>
      )}
    </div>
  );
}
