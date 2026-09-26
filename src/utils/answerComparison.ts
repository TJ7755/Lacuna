// Compares a typed answer against the expected answer text for the "type" answer-input
// mode. Used by Learn mode to give diff-friendly
// feedback after reveal; grading itself stays a separate, self-graded step.

/**
 * Normalisation applied before comparing words. Both default to true (case and
 * punctuation are ignored), matching the pre-existing typing-card behaviour.
 *
 * The answer-strictness setting controls these options without changing alignment.
 */
export interface AnswerComparisonOptions {
  /** Ignore letter case when comparing words. Default true. */
  ignoreCase?: boolean;
  /** Strip leading/trailing punctuation from each word before comparing. Default true. */
  ignorePunctuation?: boolean;
}

/** One word from the expected answer, tagged with whether the typed answer matched it. */
export interface ComparisonWord {
  /** The original (unnormalised) word, for display. */
  text: string;
  matched: boolean;
}

export interface AnswerComparisonResult {
  /** True iff every expected word was matched, in order, by the typed answer. */
  correct: boolean;
  /** The expected answer, split into words tagged for highlighting matches vs mismatches. */
  words: ComparisonWord[];
  /** Submitted words, aligned with the expected answer. */
  typedWords: ComparisonWord[];
}

const DEFAULT_OPTIONS: Required<AnswerComparisonOptions> = {
  ignoreCase: true,
  ignorePunctuation: true,
};

/** Strip leading/trailing punctuation from a word, leaving internal punctuation intact. */
function stripPunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function normaliseWord(word: string, options: Required<AnswerComparisonOptions>): string {
  let result = word;
  if (options.ignorePunctuation) result = stripPunctuation(result);
  if (options.ignoreCase) result = result.toLowerCase();
  return result;
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Align words in order so one omission does not mark every subsequent word wrong. */
export function compareAnswer(
  typed: string,
  expected: string,
  options: AnswerComparisonOptions = {},
): AnswerComparisonResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const words = splitWords(expected).map((text) => ({ text, matched: false }));
  const typedWords = splitWords(typed).map((text) => ({ text, matched: false }));
  const a = words.map((word) => normaliseWord(word.text, opts));
  const b = typedWords.map((word) => normaliseWord(word.text, opts));
  const correct = a.length > 0 && a.length === b.length && a.every((word, i) => word === b[i]);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    words[start].matched = typedWords[start].matched = true;
    start++;
  }
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    words[--endA].matched = typedWords[--endB].matched = true;
  }
  const rows = endA - start,
    columns = endB - start;
  // Bound work for unusually large imported answers. Ordered matching still preserves
  // useful feedback without allocating a quadratic table for entire essays.
  if (rows * columns > 250_000) {
    const positions = new Map<string, number[]>();
    for (let j = endB - 1; j >= start; j--) {
      const indices = positions.get(b[j]) ?? [];
      indices.push(j);
      positions.set(b[j], indices);
    }
    let cursor = start;
    for (let i = start; i < endA; i++) {
      const indices = positions.get(a[i]);
      while (indices?.length && indices[indices.length - 1] < cursor) indices.pop();
      const j = indices?.pop();
      if (j !== undefined) {
        words[i].matched = typedWords[j].matched = true;
        cursor = j + 1;
      }
    }
  } else if (rows && columns) {
    const table = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1));
    for (let i = rows - 1; i >= 0; i--)
      for (let j = columns - 1; j >= 0; j--)
        table[i][j] =
          a[start + i] === b[start + j]
            ? table[i + 1][j + 1] + 1
            : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < rows && j < columns) {
      if (a[start + i] === b[start + j]) {
        words[start + i++].matched = typedWords[start + j++].matched = true;
      } else if (table[i + 1][j] >= table[i][j + 1]) i++;
      else j++;
    }
  }
  return { correct, words, typedWords };
}
