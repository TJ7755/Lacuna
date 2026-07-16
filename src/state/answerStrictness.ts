import { useEffect, useState } from 'react';
import type { AnswerComparisonOptions } from '../utils/answerComparison';

/**
 * How strictly a typed answer (see src/state/typingSetting.ts) is compared against
 * the expected answer, per src/utils/answerComparison.ts's AnswerComparisonOptions.
 *  - `lenient`: ignore case and punctuation (default — the pre-existing behaviour).
 *  - `standard`: ignore case, but punctuation must match.
 *  - `exact`: case and punctuation both matter.
 */
export type AnswerStrictness = 'lenient' | 'standard' | 'exact';

const KEY = 'lacuna.answerStrictness';
const VALUES: AnswerStrictness[] = ['lenient', 'standard', 'exact'];

export function readAnswerStrictness(): AnswerStrictness {
  const stored = localStorage.getItem(KEY);
  return VALUES.includes(stored as AnswerStrictness) ? (stored as AnswerStrictness) : 'lenient';
}

export function writeAnswerStrictness(strictness: AnswerStrictness): void {
  localStorage.setItem(KEY, strictness);
  window.dispatchEvent(new CustomEvent('lacuna:answer-strictness', { detail: strictness }));
}

export function useAnswerStrictness(): [AnswerStrictness, (strictness: AnswerStrictness) => void] {
  const [strictness, setStrictness] = useState<AnswerStrictness>(() => readAnswerStrictness());

  useEffect(() => {
    const onChange = () => setStrictness(readAnswerStrictness());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:answer-strictness', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:answer-strictness', onChange);
    };
  }, []);

  return [
    strictness,
    (next) => {
      writeAnswerStrictness(next);
      setStrictness(next);
    },
  ];
}

/** Translate a strictness level into the comparison flags compareAnswer expects. */
export function answerComparisonOptions(strictness: AnswerStrictness): AnswerComparisonOptions {
  switch (strictness) {
    case 'exact':
      return { ignoreCase: false, ignorePunctuation: false };
    case 'standard':
      return { ignoreCase: true, ignorePunctuation: false };
    case 'lenient':
    default:
      return { ignoreCase: true, ignorePunctuation: true };
  }
}
