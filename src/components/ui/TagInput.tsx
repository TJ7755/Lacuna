import { useRef, useState, type KeyboardEvent } from 'react';
import { m as motion } from 'motion/react';
import { CloseIcon, TagIcon } from './icons';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags across the deck/collection, offered as quick suggestions. */
  suggestions?: string[];
  placeholder?: string;
}

/** Chip-style tag editor. Enter or comma commits a tag; Backspace on empty removes the last. */
export function TagInput({ tags, onChange, suggestions = [], placeholder }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,+$/, '').trim();
    if (!tag || tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...tags, tag]);
    setDraft('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const available = suggestions.filter((s) => !tags.includes(s)).slice(0, 8);

  return (
    <div>
      {/* The whole box focuses the input, so the target is the box, not the one-line field. */}
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
        className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-2 focus-within:border-accent"
      >
        <TagIcon width={15} height={15} className="text-ink-faint" />
        {tags.map((tag) => (
          <motion.span
            key={tag}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="relative inline-flex min-w-11 items-center rounded-lg bg-accent-soft py-0.5 pl-2 pr-5 text-xs text-accent-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              // The whole chip, 44px tall, removes the tag; the row keeps its compact height.
              className="absolute inset-0 flex items-center justify-end pr-1.5 transition-opacity before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:opacity-70 active:opacity-70"
            >
              <CloseIcon width={11} height={11} />
            </button>
          </motion.span>
        ))}
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={tags.length === 0 ? (placeholder ?? 'Add tags…') : ''}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {available.map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              data-press=""
              whileTap={{ scale: 0.92 }}
              className="relative min-w-11 rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft transition-colors before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:border-accent hover:text-accent-ink active:border-accent active:text-accent-ink"
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
