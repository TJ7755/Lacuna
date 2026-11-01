// SequenceEditor's item list as a keyboard-first outline. Enter starts the next item,
// Enter on an empty item starts a new section, Backspace at the start joins an item to
// the one above, the arrows move between items, Alt+arrows reorder, and pasting several
// lines adds one item per line. Section breaks stand between items (sequenceOutline.ts).

import { useEffect, useId, useRef, useState } from 'react';
import { m as motion, AnimatePresence } from 'motion/react';
import { Button } from '../ui/Button';
import { CloseIcon, PlusIcon } from '../ui/icons';
import { makeId } from '../../db/schema';
import { parseSpeakerLine } from '../../db/scriptSplitter';
import type { SequencePreset } from '../../db/sequencePresets';
import type { SequenceItem } from '../../db/types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { SequenceItemRow, type RowGesture } from './SequenceItemRow';
import {
  breakBefore,
  insertAfter,
  insertBreak,
  moveItem,
  removeAt,
  removeBreak,
  renameSection,
  sectionNumber,
  splitPaste,
  type Outline,
} from './sequenceOutline';

interface SequenceOutlineEditorProps {
  outline: Outline;
  onChange: (outline: Outline) => void;
  preset: SequencePreset;
  /** Script lines: the learner's speaker, which marks their own lines. */
  mySpeaker?: string;
  speakers: string[];
  showLabels: boolean;
  onTabForward?: () => void;
}

export function SequenceOutlineEditor({
  outline,
  onChange,
  preset,
  mySpeaker,
  speakers,
  showLabels,
  onTabForward,
}: SequenceOutlineEditorProps) {
  const { items } = outline;
  const { item: itemTerm, chunkLabel } = preset.terminology;
  const sectionTerm = chunkLabel.toLowerCase();
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const speakerListId = useId();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Structural edits replace rows; place the caret once React has mounted the result.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const input = inputs.current.get(target.id);
    if (!input) return;
    pendingFocus.current = null;
    input.focus({ preventScroll: true });
    input.setSelectionRange(target.caret, target.caret);
    input.scrollIntoView({ behavior: m > 0 ? 'smooth' : 'auto', block: 'nearest' });
  }, [outline, m]);

  function commit(next: Outline, focus?: { id: string; caret: number }) {
    if (focus) pendingFocus.current = focus;
    onChange(next);
  }

  // Moving between rows changes nothing to re-render, so focus at once.
  function focusItem(id: string, caret: number) {
    const input = inputs.current.get(id);
    input?.focus();
    input?.setSelectionRange(caret, caret);
  }

  function withBreak(next: Outline, index: number): Outline {
    const probe = insertBreak(next, index, '');
    return renameSection(probe, index, `${chunkLabel} ${sectionNumber(probe.items, index)}`);
  }

  function update(index: number, patch: Partial<SequenceItem>) {
    onChange({
      ...outline,
      items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  function handleGesture(index: number, gesture: RowGesture) {
    const item = items[index];
    switch (gesture.kind) {
      case 'enter': {
        if (!item.value.trim()) {
          if (index > 0 && !breakBefore(items, index)) {
            commit(withBreak(outline, index), { id: item.id, caret: 0 });
            setAnnouncement(`New ${sectionTerm}`);
          }
          return;
        }
        let current = item;
        const spoken = preset.usesSpeakers && !item.speaker ? parseSpeakerLine(item.value) : null;
        if (spoken && gesture.caret === item.value.length) {
          current = { ...item, ...spoken };
        }
        const caret = current === item ? gesture.caret : current.value.length;
        const added: SequenceItem = { id: makeId(), value: current.value.slice(caret).trimStart() };
        const kept = { ...current, value: current.value.slice(0, caret).trimEnd() };
        const next = insertAfter(
          { ...outline, items: items.map((it, i) => (i === index ? kept : it)) },
          index,
          [added],
        );
        commit(next, { id: added.id, caret: 0 });
        return;
      }
      case 'backspace-start': {
        if (breakBefore(items, index)) {
          commit(removeBreak(outline, index), { id: item.id, caret: 0 });
          setAnnouncement(`${chunkLabel} break removed`);
          return;
        }
        if (index === 0) return;
        const previous = items[index - 1];
        const joined = { ...previous, value: previous.value + item.value };
        const next = removeAt(
          { ...outline, items: items.map((it, i) => (i === index - 1 ? joined : it)) },
          index,
        );
        commit(next, { id: previous.id, caret: previous.value.length });
        return;
      }
      case 'focus': {
        const target = items[gesture.direction === 'up' ? index - 1 : index + 1];
        if (!target) return;
        focusItem(target.id, gesture.direction === 'up' ? target.value.length : 0);
        return;
      }
      case 'move': {
        const caret = inputs.current.get(item.id)?.selectionStart ?? 0;
        const moved = moveItem(outline, index, gesture.direction);
        if (moved.outline === outline) return;
        commit(moved.outline, { id: item.id, caret });
        setAnnouncement(`${itemTerm} ${moved.index + 1}`);
        return;
      }
      case 'paste': {
        const pieces = splitPaste(gesture.text, preset.usesSpeakers);
        if (pieces.length === 0) return;
        const before = item.value.slice(0, gesture.start);
        const after = item.value.slice(gesture.end);
        const [first, ...rest] = pieces;
        const head: SequenceItem = {
          ...item,
          value: before + first.value + (rest.length === 0 ? after : ''),
          ...(first.speaker && !before.trim() ? { speaker: first.speaker } : {}),
        };
        const added = rest.map((piece, k) => ({
          id: makeId(),
          value: piece.value + (k === rest.length - 1 ? after : ''),
          ...(piece.speaker ? { speaker: piece.speaker } : {}),
        }));
        let next = insertAfter(
          { ...outline, items: items.map((it, i) => (i === index ? head : it)) },
          index,
          added,
        );
        rest.forEach((piece, k) => {
          if (piece.startsSection) next = withBreak(next, index + 1 + k);
        });
        const last = added.at(-1) ?? head;
        commit(next, { id: last.id, caret: last.value.length - after.length });
        setAnnouncement(
          rest.length > 0
            ? `Added ${pieces.length} ${preset.terminology.itemPlural.toLowerCase()}`
            : '',
        );
        return;
      }
    }
  }

  function deleteAt(index: number) {
    const neighbour = items[index + 1] ?? items[index - 1];
    const next = removeAt(outline, index);
    if (next.items.length === 0) {
      const blank = { id: makeId(), value: '' };
      commit({ items: [blank], chunkLabels: [] }, { id: blank.id, caret: 0 });
      return;
    }
    commit(next, neighbour ? { id: neighbour.id, caret: neighbour.value.length } : undefined);
  }

  function addAtEnd(newSection: boolean) {
    const last = items.at(-1);
    if (last && !last.value.trim()) {
      const index = items.length - 1;
      const next =
        newSection && index > 0 && !breakBefore(items, index) ? withBreak(outline, index) : outline;
      commit(next, { id: last.id, caret: 0 });
      return;
    }
    const added = { id: makeId(), value: '' };
    let next = insertAfter(outline, items.length - 1, [added]);
    if (newSection && items.length > 0) next = withBreak(next, items.length);
    commit(next, { id: added.id, caret: 0 });
  }

  return (
    <div>
      {preset.usesSpeakers && (
        <datalist id={speakerListId}>
          {speakers.map((speaker) => (
            <option key={speaker} value={speaker} />
          ))}
        </datalist>
      )}
      <div className="-mx-2 flex flex-col">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              layout={m > 0 ? 'position' : undefined}
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            >
              {breakBefore(items, i) && (
                <SectionBreak
                  label={
                    item.chunkIndex === undefined
                      ? ''
                      : (outline.chunkLabels[item.chunkIndex] ?? '')
                  }
                  term={chunkLabel}
                  first={i === 0}
                  onRename={(label) => onChange(renameSection(outline, i, label))}
                  onRemove={() => commit(removeBreak(outline, i), { id: item.id, caret: 0 })}
                  onDone={() => focusItem(item.id, item.value.length)}
                />
              )}
              <SequenceItemRow
                item={item}
                index={i}
                itemTerm={itemTerm}
                showSpeaker={preset.usesSpeakers}
                speakerListId={preset.usesSpeakers ? speakerListId : undefined}
                mine={preset.usesSpeakers && mySpeaker ? item.speaker === mySpeaker : undefined}
                showLabel={showLabels}
                onChange={(patch) => update(i, patch)}
                onGesture={(gesture) => handleGesture(i, gesture)}
                onDelete={() => deleteAt(i)}
                onTabForward={i === items.length - 1 ? onTabForward : undefined}
                inputRef={(input) => {
                  if (input) inputs.current.set(item.id, input);
                  else inputs.current.delete(item.id);
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => addAtEnd(false)}>
          <PlusIcon width={14} height={14} />
          Add {itemTerm}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => addAtEnd(true)}>
          <PlusIcon width={14} height={14} />
          New {sectionTerm}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function SectionBreak({
  label,
  term,
  first,
  onRename,
  onRemove,
  onDone,
}: {
  label: string;
  term: string;
  first: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className={
        first ? 'mb-1 flex items-center gap-2 pl-10' : 'mb-1 mt-5 flex items-center gap-2 pl-10'
      }
    >
      <input
        type="text"
        value={label}
        onChange={(e) => onRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onDone();
          }
        }}
        placeholder={`${term} name`}
        aria-label={`${term} name`}
        className="min-h-11 min-w-0 flex-1 bg-transparent font-display text-base font-semibold tracking-tight text-ink outline-none placeholder:text-ink-faint focus-visible:shadow-none"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${term.toLowerCase()} break${label ? ` before ${label}` : ''}`}
        title={`Join to the ${term.toLowerCase()} above`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
