// A single item row within SequenceEditor's ordered item list: value editor,
// optional label, chunk assignment, reorder and delete controls. Extracted
// from SequenceEditor to keep that page focused on top-level composition —
// mirrors the notes list's NoteRow split.

import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { ChevronDownIcon, TrashIcon } from '../ui/icons';
import { cn } from '../ui/cn';
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
}: SequenceItemRowProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink/5 px-1.5 text-xs font-medium text-ink-faint">
          {index + 1}
        </span>
        <input
          type="text"
          value={item.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
          placeholder="Label (optional)"
          className="w-40 rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        {chunkLabels.length > 0 && (
          <select
            value={item.chunkIndex ?? ''}
            onChange={(e) =>
              onChange({ chunkIndex: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className="rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">No chunk</option>
            {chunkLabels.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
            onClick={onDelete}
            title="Delete item"
            className="flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </div>
      <MarkdownEditor
        value={item.value}
        onChange={(value) => onChange({ value })}
        minRows={2}
        placeholder="Item content. Markdown, maths and images are supported."
      />
    </div>
  );
}
