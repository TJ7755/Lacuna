// The second, coarser step of the lines-mode hint ladder (see firstLetterHint.ts for
// step one and src/components/learn/LineHint.tsx for where the two are combined):
// reduces the answer to just the first word of each clause/sentence-chunk, so a longer
// line reads as its shape ("To…, or…, that…") rather than its full text. Sits between the
// first-letter hint and full reveal in Learn mode's flow (src/pages/LearnMode.tsx) —
// optional, requested by the learner, and never itself graded.

/** A run of clause/sentence-ending punctuation, plus any whitespace immediately around
 *  it, used to split an answer into clause-sized chunks. */
const CLAUSE_BOUNDARY = /\s*[,;:.!?—]+\s*/g;

/** Reduce a clause to its first word, replacing the rest with an ellipsis. A clause with
 *  zero or one word is left unchanged — there is nothing to hide. */
function firstWordOfClause(clause: string): string {
  const words = clause.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words[0]}…`;
}

/**
 * Build a first-words hint for an answer: each clause/sentence-chunk (split at commas,
 * semicolons, colons, full stops, exclamation/question marks, and em dashes) reduced to
 * its first word, e.g. "To be, or not to be, that is the question" -> "To…, or…, that…".
 * Boundary punctuation and its surrounding whitespace are preserved as in the source.
 */
export function firstWordsHint(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return '';

  CLAUSE_BOUNDARY.lastIndex = 0;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = CLAUSE_BOUNDARY.exec(trimmed))) {
    result += firstWordOfClause(trimmed.slice(cursor, match.index)) + match[0];
    cursor = CLAUSE_BOUNDARY.lastIndex;
  }
  result += firstWordOfClause(trimmed.slice(cursor));
  return result;
}
