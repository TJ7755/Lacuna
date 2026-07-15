// A single item row within SequenceEditor's ordered item list: value editor,
// optional label, chunk assignment, reorder and delete controls. Extracted
// from SequenceEditor to keep that page focused on top-level composition —
// mirrors the notes list's NoteRow split.

import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import type { Ref } from 'react';
import type { SequenceItem } from '../../db/types';

interface SequenceItemRowProps {
  item: SequenceItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  chunkLabels: string[];
  onChange: (patch: Partial<SequenceItem>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: () => void;
  inputRef: Ref<HTMLTextAreaElement>;
  invalid: boolean;
}

export function SequenceItemRow({
  item,
  index,
  isFirst,
  isLast,
  chunkLabels,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddAfter,
  inputRef,
  invalid,
}: SequenceItemRowProps) {
  const errorId = `sequence-item-${item.id}-error`;

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-4',
        invalid ? 'border-negative/50' : 'border-line',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink/5 px-1.5 text-xs font-medium text-ink-faint">
          {index + 1}
        </span>
        <span className="text-sm font-medium text-ink-soft">Item {index + 1}</span>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={onAddAfter}
            title="Add item below"
            aria-label={`Add item below item ${index + 1}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <PlusIcon width={15} height={15} />
          </button>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
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
              'flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
              'disabled:pointer-events-none disabled:opacity-30',
            )}
          >
            <ChevronDownIcon width={14} height={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete item"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={item.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
          placeholder="Label (optional)"
          className="min-h-11 min-w-[10rem] flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {chunkLabels.length > 0 && (
          <select
            value={item.chunkIndex ?? ''}
            onChange={(e) =>
              onChange({ chunkIndex: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            aria-label={`Chunk for item ${index + 1}`}
            className="min-h-11 min-w-[10rem] flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent sm:flex-none"
          >
            <option value="">No chunk</option>
            {chunkLabels.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      <MarkdownEditor
        inputRef={inputRef}
        ariaLabel={`Item ${index + 1} content`}
        ariaInvalid={invalid}
        ariaDescribedBy={invalid ? errorId : undefined}
        value={item.value}
        onChange={(value) => onChange({ value })}
        onModEnter={onAddAfter}
        minRows={2}
        placeholder="Item content. Markdown, maths and images are supported."
      />
      {invalid && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-negative">
          Enter item content before adding another.
        </p>
      )}
    </div>
  );
}
