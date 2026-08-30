// A single collapsible note row within LessonView's notes section: title +
// chevron toggle, edit/delete/reorder controls, and Markdown content when
// expanded. Extracted from LessonView.tsx to keep that file focused on
// page-level composition.

import { useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { LessonNoteEditor } from './LessonNoteEditor';
import { MarkdownView } from '../markdown/MarkdownView';
import { ChevronDownIcon, EditIcon, TrashIcon } from '../ui/icons';
import { ConfirmInlineSwap } from '../ui/ConfirmInline';
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

export function noteRowTiming(multiplier: number) {
  return { duration: 0.18 * multiplier, ease: [0.16, 1, 0.3, 1] as const };
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
  const transition = noteRowTiming(m);
  const rootRef = useRef<HTMLDivElement>(null);

  function restoreEditFocus() {
    queueMicrotask(() =>
      rootRef.current?.querySelector<HTMLButtonElement>('[title="Edit note"]')?.focus(),
    );
  }

  return (
    <motion.div ref={rootRef} layout="position" transition={transition}>
      <AnimatePresence initial={false} mode="popLayout">
        {isEditing ? (
          <motion.div
            key="editor"
            initial={m > 0 ? { height: 0, opacity: 0 } : false}
            animate={{
              height: 'auto',
              opacity: 1,
              transitionEnd: { overflow: 'visible' },
            }}
            exit={m > 0 ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="p-5">
              <LessonNoteEditor
                note={note}
                onSave={async (data) => {
                  await onEditSave(data);
                  restoreEditFocus();
                }}
                onCancel={() => {
                  onEditCancel();
                  restoreEditFocus();
                }}
                busy={noteBusy}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={m > 0 ? { height: 0, opacity: 0 } : false}
            animate={{
              height: 'auto',
              opacity: 1,
              transitionEnd: { overflow: 'visible' },
            }}
            exit={m > 0 ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1 px-3 py-2">
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

              <ConfirmInlineSwap
                active={confirmingDelete}
                message="Delete?"
                onConfirm={onDeleteConfirm}
                onCancel={onDeleteCancel}
                swapClassName="shrink-0"
              >
                <div className="flex items-center gap-0.5">
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
                    <ChevronDownIcon width={14} height={14} className="rotate-180" />
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
                </div>
              </ConfirmInlineSwap>
            </div>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="expanded-note"
                  initial={m > 0 ? { height: 0, opacity: 0 } : false}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transitionEnd: { overflow: 'visible' },
                  }}
                  exit={m > 0 ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
                  transition={transition}
                  className="overflow-hidden border-t border-line"
                >
                  <div className="px-5 py-4">
                    <MarkdownView source={note.content} allowEmbeds />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
