import { compareAnswer, type AnswerComparisonOptions } from '../../utils/answerComparison';

export interface TypedAnswerFeedback {
  answer: string;
  options: AnswerComparisonOptions;
}

/** Decorate already-sanitised Markdown, preserving its elements and media. */
export function typedAnswerFeedbackHtml(
  html: string,
  feedback: TypedAnswerFeedback,
  cloze: boolean,
): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root = document.body;
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
    // KaTeX contains duplicate visual/accessibility text. Keep maths and media intact.
    if (node.matches('audio, img, svg, .katex, annotation')) return;
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
  const comparison = compareAnswer(feedback.answer, expected, feedback.options);
  const ranges = [...expected.matchAll(/\S+/g)].flatMap((match, i) =>
    comparison.words[i].matched ? [] : [{ start: match.index, end: match.index + match[0].length }],
  );
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
      mark.className = 'rounded-sm bg-accent-soft px-0.5 text-inherit box-decoration-clone';
      mark.textContent = value.slice(from, to);
      fragment.append(mark);
      cursor = to;
    }
    fragment.append(value.slice(cursor));
    node.replaceWith(fragment);
  }
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
