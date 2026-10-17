// One line of SequenceEditor's keyboard-first outline: a number, an optional speaker
// and label, and a growing text field. The row only recognises gestures; the editor
// owns what they do to the outline (see sequenceOutline.ts).

import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from 'react';
import { CloseIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import type { SequenceItem } from '../../db/types';

export type RowGesture =
  | { kind: 'enter'; caret: number }
  | { kind: 'backspace-start' }
  | { kind: 'focus'; direction: 'up' | 'down' }
  | { kind: 'move'; direction: 'up' | 'down' }
  | { kind: 'paste'; text: string; start: number; end: number };

interface SequenceItemRowProps {
  item: SequenceItem;
  index: number;
  /** Singular noun for one item, from the sequence's preset terminology. */
  itemTerm: string;
  showSpeaker: boolean;
  /** Id of a datalist of known speakers, offered as the speaker is typed. */
  speakerListId?: string;
  /** Script lines: whether this is one of the learner's own lines. */
  mine?: boolean;
  showLabel: boolean;
  onChange: (patch: Partial<SequenceItem>) => void;
  onGesture: (gesture: RowGesture) => void;
  onDelete: () => void;
  inputRef: Ref<HTMLTextAreaElement>;
}

function caretOnFirstLine(field: HTMLTextAreaElement) {
  return !field.value.slice(0, field.selectionStart).includes('\n');
}

function caretOnLastLine(field: HTMLTextAreaElement) {
  return !field.value.slice(field.selectionEnd).includes('\n');
}

export function SequenceItemRow({
  item,
  index,
  itemTerm,
  showSpeaker,
  speakerListId,
  mine,
  showLabel,
  onChange,
  onGesture,
  onDelete,
  inputRef,
}: SequenceItemRowProps) {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const name = `${itemTerm.charAt(0).toUpperCase()}${itemTerm.slice(1)} ${index + 1}`;

  // Grow with the text, wrapped lines included, so a long line never scrolls inside its
  // row; re-measure when the width changes, since that changes the wrapping.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const fit = () => {
      field.style.height = 'auto';
      if (field.scrollHeight > 0) field.style.height = `${field.scrollHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      fit();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [item.value]);

  function setRefs(field: HTMLTextAreaElement | null) {
    fieldRef.current = field;
    if (typeof inputRef === 'function') inputRef(field);
    else if (inputRef) inputRef.current = field;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    const field = e.currentTarget;
    const collapsed = field.selectionStart === field.selectionEnd;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    let gesture: RowGesture | null = null;
    if (e.key === 'Enter' && plain && !e.shiftKey) {
      gesture = { kind: 'enter', caret: field.selectionStart };
    } else if (e.key === 'Backspace' && plain && collapsed && field.selectionStart === 0) {
      gesture = { kind: 'backspace-start' };
    } else if (
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      e.altKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      gesture = { kind: 'move', direction: e.key === 'ArrowUp' ? 'up' : 'down' };
    } else if (e.key === 'ArrowUp' && plain && !e.shiftKey && caretOnFirstLine(field)) {
      gesture = { kind: 'focus', direction: 'up' };
    } else if (e.key === 'ArrowDown' && plain && !e.shiftKey && caretOnLastLine(field)) {
      gesture = { kind: 'focus', direction: 'down' };
    }
    if (!gesture) return;
    e.preventDefault();
    onGesture(gesture);
  }

  return (
    <div
      data-sequence-row=""
      className="group relative flex items-start gap-2 rounded-2xl py-0.5 pl-1 pr-0.5 transition-colors focus-within:bg-ink/[0.045] hover:bg-ink/[0.03]"
    >
      {mine && (
        <span
          aria-hidden
          className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full bg-accent"
        />
      )}
      <span
        aria-hidden
        className="mt-3 w-7 shrink-0 select-none text-right text-sm tabular-nums text-ink-faint"
      >
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-start sm:gap-2">
        {showSpeaker && (
          <input
            type="text"
            value={item.speaker ?? ''}
            onChange={(e) => onChange({ speaker: e.target.value || undefined })}
            list={speakerListId}
            placeholder="Speaker"
            aria-label={`Speaker for ${itemTerm} ${index + 1}`}
            className="min-h-11 w-full shrink-0 bg-transparent py-2.5 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint/70 focus-visible:shadow-none sm:w-32"
          />
        )}
        {showLabel && (
          <input
            type="text"
            value={item.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
            placeholder="Label"
            aria-label={`Label for ${itemTerm} ${index + 1}`}
            className="min-h-11 w-full shrink-0 bg-transparent py-2.5 text-sm text-ink-soft outline-none placeholder:text-ink-faint/70 focus-visible:shadow-none sm:w-32"
          />
        )}
        <textarea
          ref={setRefs}
          rows={1}
          value={item.value}
          onChange={(e) => onChange({ value: e.target.value })}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (!/\S[^\S\n]*\r?\n[\s\S]*\S/.test(text)) return;
            e.preventDefault();
            const field = e.currentTarget;
            onGesture({
              kind: 'paste',
              text,
              start: field.selectionStart,
              end: field.selectionEnd,
            });
          }}
          aria-label={`${name} content`}
          aria-keyshortcuts="Enter Shift+Enter Alt+ArrowUp Alt+ArrowDown"
          placeholder={index === 0 ? `Type or paste, one ${itemTerm} per line` : undefined}
          spellCheck
          className={cn(
            'min-h-11 w-full min-w-0 resize-none overflow-hidden sm:flex-1 bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-ink-faint focus-visible:shadow-none',
            mine === false ? 'text-ink-soft' : 'text-ink',
          )}
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={onDelete}
        aria-label={`Delete ${itemTerm} ${index + 1}`}
        title={`Delete ${itemTerm}`}
        className="touch-visible flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint opacity-0 transition-[opacity,background-color,color] hover:bg-negative/10 hover:text-negative focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
