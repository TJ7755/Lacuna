import type { NoteAnnotation } from '../../db/types';

const ORDINARY_BLOCK_SELECTOR = 'p';
const FORBIDDEN_SELECTOR =
  'code, pre, .katex, .math, .math-inline, .math-display, iframe, img, video, details, summary';

export interface SourceAnchor {
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

export type SelectionResult =
  | { anchor: SourceAnchor; error?: never }
  | { anchor?: never; error: string };

function closestElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function occurrenceOffsets(source: string, selectedText: string): number[] {
  const offsets: number[] = [];
  let from = 0;
  while (from <= source.length - selectedText.length) {
    const offset = source.indexOf(selectedText, from);
    if (offset === -1) break;
    offsets.push(offset);
    from = offset + Math.max(selectedText.length, 1);
  }
  return offsets;
}

/**
 * Convert a browser selection into a conservative Markdown-source anchor.
 * Only selections inside one ordinary paragraph are accepted. Exact uniqueness
 * is intentional: guessing through Markdown syntax would silently attach notes
 * to the wrong prose when the same wording occurs twice.
 */
export function sourceAnchorFromSelection(
  root: HTMLElement,
  source: string,
  selection: Selection | null,
): SelectionResult {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
    return { error: 'Select text within one paragraph.' };
  }

  const range = selection.getRangeAt(0);
  const startElement = closestElement(range.startContainer);
  const endElement = closestElement(range.endContainer);
  const startBlock = startElement?.closest(ORDINARY_BLOCK_SELECTOR);
  const endBlock = endElement?.closest(ORDINARY_BLOCK_SELECTOR);

  if (!startBlock || startBlock !== endBlock || !root.contains(startBlock)) {
    return { error: 'Highlights must stay within one paragraph.' };
  }

  if (startElement?.closest(FORBIDDEN_SELECTOR) || endElement?.closest(FORBIDDEN_SELECTOR)) {
    return { error: 'Code, maths and embedded content cannot be highlighted.' };
  }

  for (const forbidden of startBlock.querySelectorAll(FORBIDDEN_SELECTOR)) {
    if (range.intersectsNode(forbidden)) {
      return { error: 'Code, maths and embedded content cannot be highlighted.' };
    }
  }

  const selectedText = selection.toString();
  if (!selectedText.trim()) return { error: 'Select some text first.' };

  const offsets = occurrenceOffsets(source, selectedText);
  if (offsets.length !== 1) {
    return {
      error:
        offsets.length === 0
          ? 'That rendered text cannot be mapped safely to the note source.'
          : 'That text appears more than once. Select a more distinctive passage.',
    };
  }

  return {
    anchor: {
      startOffset: offsets[0],
      endOffset: offsets[0] + selectedText.length,
      selectedText,
    },
  };
}

export function hasValidSourceAnchor(source: string, annotation: NoteAnnotation): boolean {
  if (
    annotation.startOffset < 0 ||
    annotation.endOffset <= annotation.startOffset ||
    source.slice(annotation.startOffset, annotation.endOffset) !== annotation.selectedText
  ) {
    return false;
  }
  const offsets = occurrenceOffsets(source, annotation.selectedText);
  return offsets.length === 1 && offsets[0] === annotation.startOffset;
}

function textNodes(block: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (!text.parentElement?.closest(FORBIDDEN_SELECTOR)) nodes.push(text);
    current = walker.nextNode();
  }
  return nodes;
}

function findRenderedAnchor(
  root: HTMLElement,
  selectedText: string,
): { block: Element; offset: number } | null {
  const matches: Array<{ block: Element; offset: number }> = [];
  for (const block of root.querySelectorAll(ORDINARY_BLOCK_SELECTOR)) {
    const text = textNodes(block)
      .map((node) => node.data)
      .join('');
    for (const offset of occurrenceOffsets(text, selectedText)) {
      matches.push({ block, offset });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function markRenderedRange(block: Element, offset: number, length: number, id: string): void {
  const end = offset + length;
  let cursor = 0;
  const targets: Array<{ node: Text; start: number; end: number }> = [];

  for (const node of textNodes(block)) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.data.length;
    if (nodeEnd > offset && nodeStart < end) {
      targets.push({
        node,
        start: Math.max(0, offset - nodeStart),
        end: Math.min(node.data.length, end - nodeStart),
      });
    }
    cursor = nodeEnd;
  }

  // Work backwards so splitting one text node cannot invalidate an earlier target.
  for (const target of targets.reverse()) {
    let selected = target.node;
    if (target.start > 0) selected = selected.splitText(target.start);
    const selectedLength = target.end - target.start;
    if (selectedLength < selected.data.length) selected.splitText(selectedLength);
    const mark = document.createElement('mark');
    mark.dataset.noteHighlight = id;
    mark.className = 'rounded-sm bg-accent/20 text-inherit ring-1 ring-inset ring-accent/20';
    selected.replaceWith(mark);
    mark.append(selected);
  }
}

function clearRenderedHighlights(root: HTMLElement): void {
  for (const mark of root.querySelectorAll('mark[data-note-highlight]')) {
    mark.replaceWith(...mark.childNodes);
  }
  root.normalize();
}

/** Decorate valid, uniquely rendered anchors and return every detached id. */
export function renderAnnotationHighlights(
  root: HTMLElement,
  source: string,
  annotations: NoteAnnotation[],
): Set<string> {
  clearRenderedHighlights(root);
  const detached = new Set<string>();

  for (const annotation of annotations) {
    if (!hasValidSourceAnchor(source, annotation)) {
      detached.add(annotation.id);
      continue;
    }
    const rendered = findRenderedAnchor(root, annotation.selectedText);
    if (!rendered) {
      detached.add(annotation.id);
      continue;
    }
    markRenderedRange(
      rendered.block,
      rendered.offset,
      annotation.selectedText.length,
      annotation.id,
    );
  }

  return detached;
}
