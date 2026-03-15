/**
 * Cloze parsing utilities
 *
 * Handles Anki-compatible cloze deletion syntax: `{{c1::answer}}` or
 * `{{c1::answer::hint}}`. Index numbers are arbitrary positive integers;
 * `c1`, `c2`, `c3`, … are the most common convention.
 */

// Matches {{c<index>::<answer>}} or {{c<index>::<answer>::<hint>}}
const CLOZE_PATTERN = /\{\{c(\d+)::([^:}]+)(?:::([^}]*))?\}\}/g;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An individual cloze token — one `{{cN::...}}` occurrence.
 * Used internally and by ClozeHighlighter.
 */
export interface ClozeToken {
  /** The raw matched text, e.g. `{{c1::mitochondria}}` */
  raw: string;
  /** Cloze index, e.g. 1 for `c1` */
  index: number;
  /** The answer text */
  answer: string;
  /** Optional hint text, or null if absent */
  hint: string | null;
}

/**
 * A segment of parsed cloze text — either a plain text run or a cloze
 * deletion. `parseCloze` returns a flat array of these.
 */
export type ClozeSegment =
  | { type: 'text'; content: string }
  | { type: 'cloze'; index: number; answer: string; hint: string | undefined };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses cloze text into a flat array of ClozeToken objects.
 * Returns only the cloze tokens, not the surrounding plain text.
 * Used by ClozeHighlighter.
 */
export function parseClozeTokens(text: string): ClozeToken[] {
  const tokens: ClozeToken[] = [];
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    tokens.push({
      raw: match[0],
      index: parseInt(match[1], 10),
      answer: match[2],
      hint: match[3] ?? null,
    });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a cloze string into an ordered array of text and cloze segments.
 * Plain text between (and around) cloze tokens is included as `type: 'text'`
 * segments. Cloze tokens become `type: 'cloze'` segments.
 *
 * @example
 * parseCloze("The capital of France is {{c1::Paris}}.")
 * // → [
 * //   { type: 'text',  content: 'The capital of France is ' },
 * //   { type: 'cloze', index: 1, answer: 'Paris', hint: undefined },
 * //   { type: 'text',  content: '.' },
 * // ]
 */
export function parseCloze(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Plain text before this match.
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'cloze',
      index: parseInt(match[1], 10),
      answer: match[2],
      hint: match[3],
    });

    lastIndex = match.index + match[0].length;
  }

  // Trailing plain text.
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Returns all unique cloze indices found in a cloze string, in ascending order.
 *
 * @example
 * getClozeIndices("{{c1::A}} and {{c2::B}} and {{c1::C}}") // → [1, 2]
 */
export function getClozeIndices(text: string): number[] {
  const seen = new Set<number>();
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    seen.add(parseInt(match[1], 10));
  }

  return [...seen].sort((a, b) => a - b);
}

/**
 * Returns true if the text contains at least one valid cloze deletion with a
 * non-empty answer. Returns false for empty or purely plain-text strings.
 */
export function isValidCloze(text: string): boolean {
  if (!text.trim()) return false;
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if ((match[2] ?? '').trim()) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Renders the front of a cloze card for a given active index.
 * The target deletion is replaced with a blank `[___]` (or `[hint]` if
 * present). All other deletions are revealed as plain answer text.
 *
 * @example
 * renderClozeFront("{{c1::mitochondria}} is the {{c2::powerhouse}}", 1)
 * // → "[___] is the powerhouse"
 */
export function renderClozeFront(text: string, activeIndex: number): string {
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  return text.replace(re, (_match, indexStr, answer, hint) => {
    const idx = parseInt(indexStr, 10);
    if (idx === activeIndex) {
      return hint ? `[${hint}]` : '[___]';
    }
    return answer as string;
  });
}

/**
 * Renders the back of a cloze card for a given active index.
 * The target deletion is revealed and wrapped in `**...**` (bold markdown) to
 * distinguish it from surrounding text. All other deletions are revealed as
 * plain answer text.
 *
 * @example
 * renderClozeBack("{{c1::mitochondria}} is the {{c2::powerhouse}}", 1)
 * // → "**mitochondria** is the powerhouse"
 */
export function renderClozeBack(text: string, activeIndex: number): string {
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  return text.replace(re, (_match, indexStr, answer) => {
    const idx = parseInt(indexStr, 10);
    if (idx === activeIndex) {
      return `**${answer as string}**`;
    }
    return answer as string;
  });
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `renderClozeFront` instead.
 * Renders cloze text for study: the specified deletion index is replaced with
 * a blank (or the hint if present), while all other deletions are revealed.
 */
export function renderCloze(text: string, hiddenIndex: number): string {
  return renderClozeFront(text, hiddenIndex);
}

/**
 * @deprecated Use `renderClozeBack(text, index)` or iterate all indices.
 * Renders cloze text with ALL deletions revealed.
 */
export function renderClozeRevealed(text: string): string {
  const re = new RegExp(CLOZE_PATTERN.source, 'g');
  return text.replace(re, (_match, _indexStr, answer) => answer as string);
}

// ---------------------------------------------------------------------------
// Validation (original API — kept for backward compat)
// ---------------------------------------------------------------------------

/**
 * Validates that the cloze text is well-formed.
 * Returns `null` if valid, or a human-readable error message string if not.
 */
export function validateCloze(text: string): string | null {
  if (!text.trim()) {
    return 'Cloze text must not be empty.';
  }

  const openBraces = (text.match(/\{\{/g) ?? []).length;
  const closeBraces = (text.match(/\}\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    return 'Mismatched braces — ensure every {{ has a matching }}.';
  }

  if (!isValidCloze(text)) {
    return 'No cloze deletions found. Use {{c1::answer}} syntax.';
  }

  const tokens = parseClozeTokens(text);
  for (const token of tokens) {
    if (!token.answer.trim()) {
      return `Empty answer in deletion c${token.index}.`;
    }
  }

  return null;
}
