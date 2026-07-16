// A graded hint step for lines-mode sequence cards (see src/db/sequenceGeneration.ts):
// reduces the answer to each word's first letter, keeping surrounding punctuation so the
// hint still reads as the original sentence's shape. Sits between the question and full
// reveal in Learn mode's flow (src/pages/LearnMode.tsx) — optional, requested by the
// learner, and never itself graded.

/** Matches a word's leading non-alphanumeric run, its first letter/digit, and the rest. */
const WORD_PARTS = /^([^\p{L}\p{N}]*)([\p{L}\p{N}])(.*)$/u;

/** Reduce a single word to its first letter/digit, stripping any other letters/digits
 *  from the remainder but preserving punctuation (leading, trailing, or internal) in place.
 *  Words with no letter/digit at all (e.g. "—") pass through unchanged. */
function firstLetterOfWord(word: string): string {
  const match = WORD_PARTS.exec(word);
  if (!match) return word;
  const [, leading, firstChar, rest] = match;
  return `${leading}${firstChar}${rest.replace(/[\p{L}\p{N}]/gu, '')}`;
}

/**
 * Build a first-letter hint for an answer: each word reduced to its initial letter,
 * e.g. "To be, or not to be" -> "T b, o n t b". Whitespace is normalised to single
 * spaces (word grouping is what matters for the hint, not the source's exact spacing).
 */
export function firstLetterHint(answer: string): string {
  return answer
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(firstLetterOfWord)
    .join(' ');
}
