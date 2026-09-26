import { describe, expect, it } from 'vitest';
import { compareAnswer } from './answerComparison';

describe('compareAnswer', () => {
  it('marks an exact match as correct', () => {
    const result = compareAnswer('Tokyo', 'Tokyo');
    expect(result.correct).toBe(true);
    expect(result.words).toEqual([{ text: 'Tokyo', matched: true }]);
  });

  it('ignores case by default', () => {
    const result = compareAnswer('tokyo', 'Tokyo');
    expect(result.correct).toBe(true);
  });

  it('ignores leading/trailing punctuation by default', () => {
    const result = compareAnswer('Tokyo.', 'Tokyo');
    expect(result.correct).toBe(true);
  });

  it('does not strip internal punctuation', () => {
    const result = compareAnswer('e.g.', 'e.g.');
    expect(result.correct).toBe(true);
  });

  it('flags a wrong word as unmatched but still reports every expected word', () => {
    const result = compareAnswer('Osaka', 'Tokyo');
    expect(result.correct).toBe(false);
    expect(result.words).toEqual([{ text: 'Tokyo', matched: false }]);
  });

  it('compares multi-word answers positionally', () => {
    const result = compareAnswer('the mitochondria', 'the mitochondria');
    expect(result.correct).toBe(true);
    expect(result.words).toEqual([
      { text: 'the', matched: true },
      { text: 'mitochondria', matched: true },
    ]);
  });

  it('marks incorrect when word counts differ', () => {
    const result = compareAnswer('the mitochondria is', 'the mitochondria');
    expect(result.correct).toBe(false);
    expect(result.words.every((w) => w.matched)).toBe(true);
  });

  it('marks incorrect when the typed answer is shorter', () => {
    const result = compareAnswer('the', 'the mitochondria');
    expect(result.correct).toBe(false);
    expect(result.words).toEqual([
      { text: 'the', matched: true },
      { text: 'mitochondria', matched: false },
    ]);
  });

  it('treats an empty typed answer as entirely unmatched', () => {
    const result = compareAnswer('', 'Tokyo');
    expect(result.correct).toBe(false);
    expect(result.words).toEqual([{ text: 'Tokyo', matched: false }]);
  });

  it('treats an empty expected answer as vacuously incorrect (no words to match)', () => {
    const result = compareAnswer('anything', '');
    expect(result.correct).toBe(false);
    expect(result.words).toEqual([]);
  });

  it('respects ignoreCase: false', () => {
    const result = compareAnswer('tokyo', 'Tokyo', { ignoreCase: false });
    expect(result.correct).toBe(false);
  });

  it('respects ignorePunctuation: false', () => {
    const result = compareAnswer('Tokyo.', 'Tokyo', { ignorePunctuation: false });
    expect(result.correct).toBe(false);
  });

  it('collapses extra whitespace between words', () => {
    const result = compareAnswer('the   mitochondria', 'the mitochondria');
    expect(result.correct).toBe(true);
  });
  it('aligns a missing prefix without flagging the remaining answer', () => {
    const result = compareAnswer('timetable', 'a lighter timetable');
    expect(result.words.map((word) => word.matched)).toEqual([false, false, true]);
    expect(result.typedWords).toEqual([{ text: 'timetable', matched: true }]);
    expect(result.correct).toBe(false);
  });

  it('isolates inserted words and preserves repeated-word order', () => {
    const result = compareAnswer('the very very blue sky', 'the very blue sky');
    expect(result.words.every((word) => word.matched)).toBe(true);
    expect(result.typedWords.filter((word) => !word.matched).map((word) => word.text)).toEqual([
      'very',
    ]);
    expect(result.correct).toBe(false);
    expect(compareAnswer('blue the sky', 'the blue sky').correct).toBe(false);
  });
  it('bounds alignment work for long answers while retaining ordered matches', () => {
    const expected = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
    const result = compareAnswer(`extra ${expected} ending`, expected);
    expect(result.words.every((word) => word.matched)).toBe(true);
    expect(result.typedWords.filter((word) => !word.matched).map((word) => word.text)).toEqual([
      'extra',
      'ending',
    ]);
    expect(result.correct).toBe(false);
  });
});
