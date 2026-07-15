// Compares a typed answer against the expected answer text for the "type" answer-input
// mode (see src/state/typingSetting.ts). Used by Learn mode to give diff-friendly
// feedback after reveal; grading itself stays a separate, self-graded step.

/**
 * Normalisation applied before comparing words. Both default to true (case and
 * punctuation are ignored), matching the pre-existing typing-card behaviour.
 *
 * These are exposed as options rather than hard-coded so a future "strictness"
 * setting can turn them off per-user (e.g. an exact-match mode that cares about
 * capitalisation and punctuation) without changing the comparison algorithm.
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

/**
 * Compare a typed answer against the expected answer text, word by word in order.
 * Returns per-word match flags (for highlighting) and an overall correctness flag.
 *
 * The comparison is deliberately simple and positional (word N of the typed answer
 * is checked against word N of the expected answer) rather than a full edit-distance
 * diff — this keeps the feedback predictable and matches how a self-graded typed
 * answer is used: the learner sees at a glance which words they got right.
 */
export function compareAnswer(
  typed: string,
  expected: string,
  options: AnswerComparisonOptions = {},
): AnswerComparisonResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const expectedWords = splitWords(expected);
  const typedWords = splitWords(typed).map((w) => normaliseWord(w, opts));

  const words: ComparisonWord[] = expectedWords.map((word, i) => ({
    text: word,
    matched: typedWords[i] !== undefined && typedWords[i] === normaliseWord(word, opts),
  }));

  const correct =
    words.length > 0 &&
    words.every((w) => w.matched) &&
    typedWords.length === expectedWords.length;

  return { correct, words };
}
