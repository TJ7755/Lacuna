import { describe, expect, it } from 'vitest';
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
import type { SequenceItem } from '@lacuna/core/db/types';

const item = (id: string, chunkIndex?: number): SequenceItem =>
  chunkIndex === undefined ? { id, value: id } : { id, value: id, chunkIndex };

const chunks = (outline: Outline) => outline.items.map((i) => i.chunkIndex ?? null);

describe('sequence outline', () => {
  const poem: Outline = {
    items: [item('a'), item('b'), item('c', 0), item('d', 0), item('e', 1)],
    chunkLabels: ['Verse 2', 'Verse 3'],
  };

  it('shows breaks where the section changes, including a legacy unsectioned run', () => {
    expect(poem.items.map((_, i) => breakBefore(poem.items, i))).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);
    const legacy = [item('a', 0), item('b')];
    expect(breakBefore(legacy, 0)).toBe(true);
    expect(breakBefore(legacy, 1)).toBe(true);
  });

  it('numbers sections from the unlabelled opening run', () => {
    expect([0, 2, 4].map((i) => sectionNumber(poem.items, i))).toEqual([1, 2, 3]);
  });

  it('inserts a break that runs only to the end of the current section', () => {
    const next = insertBreak(poem, 1, 'Verse 2');
    expect(chunks(next)).toEqual([null, 2, 0, 0, 1]);
    expect(next.chunkLabels).toEqual(['Verse 2', 'Verse 3', 'Verse 2']);
    expect(insertBreak(poem, 2, 'x')).toBe(poem);
  });

  it('removes a break by merging into the section above and drops the unused label', () => {
    const next = removeBreak(poem, 4);
    expect(chunks(next)).toEqual([null, null, 0, 0, 0]);
    expect(next.chunkLabels).toEqual(['Verse 2']);
    const top = removeBreak(poem, 2);
    expect(chunks(top)).toEqual([null, null, null, null, 0]);
    expect(top.chunkLabels).toEqual(['Verse 3']);
  });

  it('gives an unlabelled run a label when renamed', () => {
    const legacy: Outline = { items: [item('a', 0), item('b'), item('c')], chunkLabels: ['One'] };
    const next = renameSection(legacy, 1, 'Two');
    expect(chunks(next)).toEqual([0, 1, 1]);
    expect(next.chunkLabels).toEqual(['One', 'Two']);
  });

  it('crosses a break as its own step before swapping places', () => {
    const up = moveItem(poem, 2, 'up');
    expect(up.index).toBe(2);
    expect(chunks(up.outline)).toEqual([null, null, null, 0, 1]);
    const down = moveItem(poem, 3, 'down');
    expect(down.index).toBe(3);
    expect(chunks(down.outline)).toEqual([null, null, 0, 1, 1]);
    const swap = moveItem(poem, 0, 'down');
    expect(swap.index).toBe(1);
    expect(swap.outline.items.map((i) => i.id)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('drops a section label once its last item leaves', () => {
    const next = moveItem(poem, 4, 'up').outline;
    expect(next.chunkLabels).toEqual(['Verse 2']);
    expect(chunks(removeAt(poem, 4))).toEqual([null, null, 0, 0]);
  });

  it('inserts into the section of the item above', () => {
    const next = insertAfter(poem, 3, [{ id: 'x', value: '' }]);
    expect(next.items[4]).toEqual({ id: 'x', value: '', chunkIndex: 0 });
  });

  it('splits pasted lines, with blank lines starting sections', () => {
    expect(splitPaste('One\nTwo\n\n\nThree\n', false)).toEqual([
      { value: 'One', startsSection: false },
      { value: 'Two', startsSection: false },
      { value: 'Three', startsSection: true },
    ]);
  });

  it('keeps script speakers and continuation lines, falling back to plain lines', () => {
    expect(splitPaste('Stage dark.\nHAMLET: To be\nor not\nOPHELIA: My lord?', true)).toEqual([
      { value: 'Stage dark.', startsSection: false },
      { value: 'To be\nor not', speaker: 'HAMLET', startsSection: false },
      { value: 'My lord?', speaker: 'OPHELIA', startsSection: false },
    ]);
    expect(splitPaste('no speakers\nhere', true)).toHaveLength(2);
  });
});
