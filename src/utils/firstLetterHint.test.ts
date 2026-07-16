import { describe, expect, it } from 'vitest';
import { firstLetterHint } from './firstLetterHint';

describe('firstLetterHint', () => {
  it('reduces each word to its first letter, keeping trailing punctuation', () => {
    expect(firstLetterHint('To be, or not to be')).toBe('T b, o n t b');
  });

  it('keeps leading punctuation attached', () => {
    expect(firstLetterHint('"Hello," she said')).toBe('"H," s s');
  });

  it('handles internal apostrophes', () => {
    expect(firstLetterHint("don't stop")).toBe("d' s");
  });

  it('collapses irregular whitespace to single spaces', () => {
    expect(firstLetterHint('  one   two  three ')).toBe('o t t');
  });

  it('passes through punctuation-only tokens unchanged', () => {
    expect(firstLetterHint('wait — really?')).toBe('w — r?');
  });

  it('returns an empty string for empty input', () => {
    expect(firstLetterHint('')).toBe('');
  });

  it('handles a single word', () => {
    expect(firstLetterHint('Hello')).toBe('H');
  });
});
