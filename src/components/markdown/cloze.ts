// Cloze deletion parsing. Supports the standard notation:
//   {{c1::hidden answer}}
//   {{c1::hidden answer::optional hint}}
// A single card hides every cloze span simultaneously. On the front, each span is
// rendered as "[...]" (or its hint, in brackets). On the back, the hidden text is
// revealed and highlighted inline within the full sentence.

const CLOZE_PATTERN = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;

export interface ClozeSpan {
  index: number;
  answer: string;
  hint?: string;
}

/** Extract all cloze spans from a source string. */
export function parseClozes(source: string): ClozeSpan[] {
  const spans: ClozeSpan[] = [];
  for (const match of source.matchAll(CLOZE_PATTERN)) {
    spans.push({
      index: Number(match[1]),
      answer: match[2],
      hint: match[3] || undefined,
    });
  }
  return spans;
}

/** Whether a source string contains any cloze notation. */
export function hasCloze(source: string): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  return CLOZE_PATTERN.test(source);
}

/**
 * Produce the question form: every cloze span replaced by a blank placeholder.
 * If a span has a hint, the placeholder shows "[hint]" instead of "[...]".
 * The blank is wrapped in an HTML span so the markdown renderer can style it.
 */
export function renderClozeFront(source: string): string {
  return source.replace(CLOZE_PATTERN, (_full, _idx, _answer, hint) => {
    const label = hint ? `[${hint}]` : '[...]';
    return `<span class="cloze-blank">${escapeHtml(label)}</span>`;
  });
}

/**
 * Produce the answer form: every cloze span replaced by its answer, wrapped in a
 * highlight span so the revealed text stands out inline within the sentence.
 */
export function renderClozeBack(source: string): string {
  return source.replace(CLOZE_PATTERN, (_full, _idx, answer) => {
    return `<span class="cloze-reveal">${escapeHtml(answer)}</span>`;
  });
}

/** The next available cloze index for a source, used by the editor's Cloze button. */
export function nextClozeIndex(source: string): number {
  const spans = parseClozes(source);
  if (spans.length === 0) return 1;
  return Math.max(...spans.map((s) => s.index)) + 1;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
