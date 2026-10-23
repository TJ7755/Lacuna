import { compareAnswer, type AnswerComparisonOptions } from '../../utils/answerComparison';
import type { JevTypedFeedback } from '../../jev';

/**
 * A model's reading of the typed answer, which replaces the word-by-word comparison.
 * `expected` is the plain text the part offsets refer to.
 */
export type TypedAnswerJudgement =
  | { state: 'checking' }
  | {
      state: 'judged';
      outcome: 'correct' | 'incorrect' | 'unsure';
      expected: string;
      feedback: JevTypedFeedback;
      /** How sure the marker was, when it marked the answer. */
      confidence?: number;
    };

export interface TypedAnswerFeedback {
  answer: string;
  options: AnswerComparisonOptions;
  judgement?: TypedAnswerJudgement;
}

/** Whether a typed answer matches already-sanitised Markdown, as the feedback marks it. */
export function typedAnswerCorrect(html: string, feedback: TypedAnswerFeedback): boolean {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const { expected } = expectedText(root, false);
  const options = root.querySelector('.katex')
    ? { ignoreCase: false, ignorePunctuation: false }
    : feedback.options;
  return compareAnswer(feedback.answer, expected, options).correct;
}

/** The plain text of already-sanitised Markdown, as typed answers are compared with it. */
export function plainTextFromHtml(html: string | HTMLElement, preserveLineBreaks = false): string {
  const body =
    typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html').body : html;
  const text = expectedText(body, false).expected;
  return preserveLineBreaks
    ? text.replace(/[^\S\n]+/g, ' ').replace(/\n+/g, '\n').trim()
    : text.replace(/\s+/g, ' ').trim();
}

/** The answer text a typed response is compared with, and the text nodes holding it. */
function expectedText(root: HTMLElement, cloze: boolean) {
  const nodes: { node: Text; start: number; end: number }[] = [];
  let expected = '';
  function collect(node: Node) {
    if (node.nodeType === 3) {
      const start = expected.length;
      expected += node.textContent ?? '';
      nodes.push({ node: node as Text, start, end: expected.length });
      return;
    }
    if (!(node instanceof Element)) return;
    // Use the authored formula once; never decorate KaTeX's duplicate visual/accessibility nodes.
    if (node.matches('.katex')) {
      expected += ` ${node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? ''} `;
      return;
    }
    if (node.matches('audio, img, svg, annotation')) return;
    const block = node.matches('p, div, li, pre, h1, h2, h3, h4, h5, h6, tr, td, th, br');
    if (block) expected += '\n';
    node.childNodes.forEach(collect);
    if (block) expected += '\n';
  }
  const targets = cloze ? [...root.querySelectorAll('.cloze-reveal')] : [root];
  targets.forEach((target, i) => {
    if (i > 0) expected += ', ';
    collect(target);
    if (cloze) target.removeAttribute('class');
  });
  return { nodes, expected };
}

/** Decorate already-sanitised Markdown, preserving its elements and media. */
export function typedAnswerFeedbackHtml(
  html: string,
  feedback: TypedAnswerFeedback,
  cloze: boolean,
): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root = document.body;
  const { nodes, expected } = expectedText(root, cloze);
  if (feedback.judgement) {
    judgedFeedback(document, nodes, expected, feedback.answer, feedback.judgement);
    return root.innerHTML;
  }
  const comparison = compareAnswer(feedback.answer, expected, feedback.options);
  const ranges = [...expected.matchAll(/\S+/g)].flatMap((match, i) =>
    comparison.words[i].matched ? [] : [{ start: match.index, end: match.index + match[0].length }],
  );
  markRanges(document, nodes, ranges);
  if (!comparison.correct && feedback.answer.trim()) {
    const submitted = document.createElement('div');
    submitted.setAttribute('aria-label', 'Submitted response');
    submitted.className =
      'mb-4 whitespace-pre-wrap break-words text-base leading-relaxed text-ink-faint';
    let index = 0;
    for (const part of feedback.answer.trim().split(/(\s+)/)) {
      if (!part || /^\s+$/.test(part)) {
        submitted.append(part);
        continue;
      }
      if (comparison.typedWords[index++].matched) submitted.append(part);
      else {
        const removed = document.createElement('del');
        removed.className = 'decoration-negative/65';
        removed.textContent = part;
        submitted.append(removed);
      }
    }
    root.prepend(submitted);
  }
  return root.innerHTML;
}

type TextNodeRange = { node: Text; start: number; end: number };
type Range = { start: number; end: number };

function markRanges(
  document: Document,
  nodes: TextNodeRange[],
  ranges: Range[],
  className?: string,
) {
  for (const { node, start, end } of nodes) {
    const overlaps = ranges.filter((range) => range.start < end && range.end > start);
    if (!overlaps.length) continue;
    const fragment = document.createDocumentFragment();
    const value = node.data;
    let cursor = 0;
    for (const range of overlaps) {
      const from = Math.max(range.start, start) - start;
      const to = Math.min(range.end, end) - start;
      fragment.append(value.slice(cursor, from));
      const mark = document.createElement('mark');
      mark.className =
        className ?? 'rounded-sm bg-accent-soft px-0.5 text-inherit box-decoration-clone';
      mark.textContent = value.slice(from, to);
      fragment.append(mark);
      cursor = to;
    }
    fragment.append(value.slice(cursor));
    node.replaceWith(fragment);
  }
}

/**
 * Finds `needle` in `haystack` ignoring differences in whitespace, from `from` onwards, and
 * returns its range in `haystack`. The marker sees collapsed plain text; the card keeps its
 * line breaks.
 */
function findLoosely(haystack: string, needle: string, from: number): Range | null {
  const target = needle.replace(/\s+/g, ' ').trim();
  if (!target) return null;
  let collapsed = '';
  const origin: number[] = [];
  for (let i = from; i < haystack.length; i++) {
    const char = haystack[i];
    if (/\s/.test(char)) {
      if (collapsed && !collapsed.endsWith(' ')) {
        collapsed += ' ';
        origin.push(i);
      }
      continue;
    }
    collapsed += char;
    origin.push(i);
  }
  const at = collapsed.indexOf(target);
  if (at < 0) return null;
  return { start: origin[at], end: origin[at + target.length - 1] + 1 };
}

const VERDICTS: Record<string, string> = {
  'correct:same': 'Right, in your own words',
  'correct:spelling': 'Right, apart from the spelling',
  'correct:imprecise': 'Right idea',
  'correct:partial': 'Right',
  'correct:wrong': 'Right',
  'correct:blank': 'Right',
  'correct:': 'Right',
  'incorrect:same': 'Not quite',
  'incorrect:spelling': 'Close. Check the spelling',
  'incorrect:imprecise': 'Right idea, but not precise enough',
  'incorrect:partial': 'Partly right',
  'incorrect:wrong': 'Not quite',
  'incorrect:blank': 'Here is the answer',
  'incorrect:': 'Not quite',
  'unsure:spelling': 'Close. Check the spelling',
  'unsure:imprecise': 'Right idea, but is it precise enough?',
  'unsure:partial': 'Partly right',
};

/** The short line a judgement opens with, or null when it would add nothing. */
export function typedVerdictText(
  judgement: Extract<TypedAnswerJudgement, { state: 'judged' }>,
): string | null {
  return VERDICTS[`${judgement.outcome}:${judgement.feedback.kind ?? ''}`] ?? null;
}

function judgedFeedback(
  document: Document,
  nodes: TextNodeRange[],
  expected: string,
  answer: string,
  judgement: TypedAnswerJudgement,
) {
  const root = document.body;
  const content = document.createElement('div');
  content.append(...root.childNodes);
  root.append(content);
  if (judgement.state === 'checking') {
    // The answer breathes while the marker reads it; nothing is marked yet.
    content.setAttribute('data-typed-checking', '');
    if (answer.trim()) root.prepend(submittedAnswer(document, answer));
    return;
  }
  const missed: Range[] = [];
  let cursor = 0;
  for (const part of judgement.feedback.parts) {
    const found = findLoosely(expected, judgement.expected.slice(part.start, part.end), cursor);
    if (!found) continue;
    cursor = found.end;
    if (part.covered === false) missed.push(found);
  }
  markRanges(
    document,
    nodes,
    missed,
    'typed-missed rounded-sm bg-accent-soft px-0.5 text-inherit box-decoration-clone',
  );
  content.querySelectorAll('mark.typed-missed').forEach((mark, index) => {
    (mark as HTMLElement).style.animationDelay = `${index * 60}ms`;
  });
  const header = document.createElement('div');
  header.className = 'mb-4 flex flex-col items-center gap-1';
  const verdict = typedVerdictText(judgement);
  if (verdict) {
    const line = document.createElement('p');
    line.setAttribute('data-typed-verdict', judgement.outcome);
    line.className =
      'typed-verdict text-sm font-medium ' +
      (judgement.outcome === 'correct'
        ? 'text-positive'
        : judgement.outcome === 'incorrect'
          ? 'text-negative'
          : 'text-ink-soft');
    line.textContent = verdict;
    if (judgement.confidence !== undefined) {
      const sure = `Marked by Jev, ${Math.round(judgement.confidence * 100)}% sure`;
      line.title = sure;
      const note = document.createElement('span');
      note.className = 'sr-only';
      note.textContent = `. ${sure}.`;
      line.append(note);
    }
    header.append(line);
  }
  if (judgement.outcome !== 'correct' && answer.trim())
    header.append(submittedAnswer(document, answer));
  if (header.childNodes.length) root.prepend(header);
}

function submittedAnswer(document: Document, answer: string) {
  const submitted = document.createElement('div');
  submitted.setAttribute('aria-label', 'Submitted response');
  submitted.className = 'whitespace-pre-wrap break-words text-base leading-relaxed text-ink-faint';
  submitted.textContent = answer.trim();
  return submitted;
}
