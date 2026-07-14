import { describe, expect, it } from 'vitest';
import type { NoteAnnotation } from '../../db/types';
import {
  hasValidSourceAnchor,
  renderAnnotationHighlights,
  sourceAnchorFromSelection,
} from './noteAnchors';

function select(start: Text, startOffset: number, end: Text, endOffset: number): Selection {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function annotation(overrides: Partial<NoteAnnotation> = {}): NoteAnnotation {
  return {
    id: 'annotation-1',
    noteId: 'note-1',
    startOffset: 6,
    endOffset: 10,
    selectedText: 'beta',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('note annotation anchors', () => {
  it('maps a unique selection in one paragraph to exact source offsets', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Alpha <strong>beta</strong> gamma</p>';
    const text = root.querySelector('strong')!.firstChild as Text;

    expect(
      sourceAnchorFromSelection(root, 'Alpha **beta** gamma', select(text, 0, text, 4)),
    ).toEqual({
      anchor: { startOffset: 8, endOffset: 12, selectedText: 'beta' },
    });
  });

  it('rejects ambiguous, cross-paragraph and code selections', () => {
    const duplicateRoot = document.createElement('div');
    duplicateRoot.innerHTML = '<p>Same phrase and Same phrase</p>';
    const duplicateText = duplicateRoot.querySelector('p')!.firstChild as Text;
    expect(
      sourceAnchorFromSelection(
        duplicateRoot,
        'Same phrase and Same phrase',
        select(duplicateText, 0, duplicateText, 11),
      ).error,
    ).toMatch(/appears more than once/i);

    const crossRoot = document.createElement('div');
    crossRoot.innerHTML = '<p>First</p><p>Second</p>';
    const paragraphs = crossRoot.querySelectorAll('p');
    expect(
      sourceAnchorFromSelection(
        crossRoot,
        'First\n\nSecond',
        select(paragraphs[0].firstChild as Text, 0, paragraphs[1].firstChild as Text, 6),
      ).error,
    ).toMatch(/one paragraph/i);

    const codeRoot = document.createElement('div');
    codeRoot.innerHTML = '<p>Use <code>const value</code> here</p>';
    const codeText = codeRoot.querySelector('code')!.firstChild as Text;
    expect(
      sourceAnchorFromSelection(
        codeRoot,
        'Use `const value` here',
        select(codeText, 0, codeText, 5),
      ).error,
    ).toMatch(/code, maths and embedded content/i);
  });

  it('treats edited and non-unique source anchors as detached', () => {
    expect(hasValidSourceAnchor('Alpha beta', annotation())).toBe(true);
    expect(hasValidSourceAnchor('Alpha zeta', annotation())).toBe(false);
    expect(hasValidSourceAnchor('Alpha beta and beta', annotation())).toBe(false);
  });

  it('marks a valid unique rendered anchor across inline elements', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Alpha <strong>be</strong>ta gamma</p>';
    const detached = renderAnnotationHighlights(root, 'Alpha beta gamma', [annotation()]);

    expect(detached.size).toBe(0);
    expect(root.querySelectorAll('mark[data-note-highlight="annotation-1"]')).toHaveLength(2);
    expect(root.textContent).toBe('Alpha beta gamma');
  });

  it('does not mark an anchor whose rendered location is ambiguous', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Alpha beta</p><p>Another beta</p>';
    const detached = renderAnnotationHighlights(root, 'Alpha beta', [annotation()]);

    expect(detached).toEqual(new Set(['annotation-1']));
    expect(root.querySelector('mark')).toBeNull();
  });
});
