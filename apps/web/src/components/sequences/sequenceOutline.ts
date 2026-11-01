// Pure outline operations behind SequenceEditor's keyboard-first item list. Sections
// (verses, scenes, eras) are shown as breaks between items rather than picked per item:
// a break sits before every item whose `chunkIndex` differs from the previous item's, so
// existing sequences display without migration. Every operation returns new arrays and
// drops chunk labels no item refers to any more.

import { splitScript, type SplitScriptItem } from '../../db/scriptSplitter';
import type { SequenceItem } from '../../db/types';

export interface Outline {
  items: SequenceItem[];
  chunkLabels: string[];
}

/** Whether a section break is shown before `items[index]`. */
export function breakBefore(items: readonly SequenceItem[], index: number): boolean {
  const chunk = items[index]?.chunkIndex;
  return index === 0 ? chunk !== undefined : chunk !== items[index - 1].chunkIndex;
}

/** The last index of the run of items sharing `items[index]`'s section. */
function runEnd(items: readonly SequenceItem[], index: number): number {
  let end = index;
  while (end + 1 < items.length && !breakBefore(items, end + 1)) end++;
  return end;
}

function withChunk(item: SequenceItem, chunkIndex: number | undefined): SequenceItem {
  if (chunkIndex === undefined) {
    const { chunkIndex: _chunk, ...rest } = item;
    return rest;
  }
  return { ...item, chunkIndex };
}

/** Drop labels no item uses and renumber the rest, keeping their order. */
export function compactSections({ items, chunkLabels }: Outline): Outline {
  const used = new Set(items.map((item) => item.chunkIndex).filter((i) => i !== undefined));
  if (used.size === chunkLabels.length) return { items, chunkLabels };
  const remap = new Map<number, number>();
  const labels: string[] = [];
  chunkLabels.forEach((label, i) => {
    if (!used.has(i)) return;
    remap.set(i, labels.length);
    labels.push(label);
  });
  return {
    items: items.map((item) =>
      item.chunkIndex === undefined ? item : withChunk(item, remap.get(item.chunkIndex)),
    ),
    chunkLabels: labels,
  };
}

/** The 1-based number of the section `items[index]` starts or belongs to. */
export function sectionNumber(items: readonly SequenceItem[], index: number): number {
  let count = items.length > 0 && !breakBefore(items, 0) ? 1 : 0;
  for (let i = 0; i <= index; i++) if (breakBefore(items, i)) count++;
  return count;
}

/** Start a new section at `items[index]`, running to the end of its current section. */
export function insertBreak(outline: Outline, index: number, label: string): Outline {
  const { items, chunkLabels } = outline;
  if (index <= 0 && breakBefore(items, 0)) return outline;
  if (index > 0 && breakBefore(items, index)) return outline;
  const chunk = chunkLabels.length;
  const end = runEnd(items, index);
  return compactSections({
    items: items.map((item, i) => (i >= index && i <= end ? withChunk(item, chunk) : item)),
    chunkLabels: [...chunkLabels, label],
  });
}

/** Remove the break before `items[index]`, merging its section into the one above. */
export function removeBreak(outline: Outline, index: number): Outline {
  const { items } = outline;
  if (!breakBefore(items, index)) return outline;
  const end = runEnd(items, index);
  const chunk = items[index - 1]?.chunkIndex;
  return compactSections({
    items: items.map((item, i) => (i >= index && i <= end ? withChunk(item, chunk) : item)),
    chunkLabels: outline.chunkLabels,
  });
}

/** Rename the section starting at `items[index]`; an unlabelled run gains a label. */
export function renameSection(outline: Outline, index: number, label: string): Outline {
  const chunk = outline.items[index]?.chunkIndex;
  if (chunk !== undefined) {
    return {
      items: outline.items,
      chunkLabels: outline.chunkLabels.map((l, i) => (i === chunk ? label : l)),
    };
  }
  const next = outline.chunkLabels.length;
  const end = runEnd(outline.items, index);
  return {
    items: outline.items.map((item, i) => (i >= index && i <= end ? withChunk(item, next) : item)),
    chunkLabels: [...outline.chunkLabels, label],
  };
}

/** Insert items after `index` (or at the top for -1), joining that item's section. */
export function insertAfter(outline: Outline, index: number, added: SequenceItem[]): Outline {
  const chunk = outline.items[index]?.chunkIndex;
  const items = [...outline.items];
  items.splice(index + 1, 0, ...added.map((item) => withChunk(item, item.chunkIndex ?? chunk)));
  return compactSections({ items, chunkLabels: outline.chunkLabels });
}

export function removeAt(outline: Outline, index: number): Outline {
  return compactSections({
    items: outline.items.filter((_, i) => i !== index),
    chunkLabels: outline.chunkLabels,
  });
}

/**
 * Move one item a step. Crossing a section break is itself a step: the item changes
 * section without changing places, so a line can leave a verse without jumping a line.
 * Returns the item's new index.
 */
export function moveItem(
  outline: Outline,
  index: number,
  direction: 'up' | 'down',
): { outline: Outline; index: number } {
  const { items } = outline;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return { outline, index };
  const boundary = direction === 'up' ? breakBefore(items, index) : breakBefore(items, target);
  const next = [...items];
  if (boundary) {
    next[index] = withChunk(items[index], items[target].chunkIndex);
    return { outline: compactSections({ items: next, chunkLabels: outline.chunkLabels }), index };
  }
  [next[index], next[target]] = [next[target], next[index]];
  return { outline: { items: next, chunkLabels: outline.chunkLabels }, index: target };
}

export interface PastedPiece {
  value: string;
  speaker?: string;
  /** A blank line came before this piece, so it starts a new section. */
  startsSection: boolean;
}

/**
 * Split pasted text into items: one per line, with blank lines starting a new section.
 * Scripts keep their "NAME: line" speakers and treat wrapped lines as continuations,
 * falling back to plain lines when no speaker is recognised.
 */
export function splitPaste(text: string, usesSpeakers: boolean): PastedPiece[] {
  if (usesSpeakers) {
    let n = 0;
    const script = splitScript(text, () => String(n++));
    if (script.items.length > 0) {
      const lead: PastedPiece[] = script.unmatchedLines.map((value) => ({
        value,
        startsSection: false,
      }));
      return [
        ...lead,
        ...script.items.map(({ speaker, value }: SplitScriptItem) => ({
          value,
          speaker,
          startsSection: false,
        })),
      ];
    }
  }
  const pieces: PastedPiece[] = [];
  let blank = false;
  for (const raw of text.split(/\r?\n/)) {
    const value = raw.trim();
    if (!value) {
      blank = pieces.length > 0;
      continue;
    }
    pieces.push({ value, startsSection: blank });
    blank = false;
  }
  return pieces;
}
