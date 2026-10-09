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

  it('keeps combining accents attached to the initial letter', () => {
    expect(firstLetterHint('E\u0301lan vital')).toBe('E\u0301 v');
  });

  it('removes combining accents belonging to hidden letters', () => {
    expect(firstLetterHint('cafe\u0301, de\u0301ja\u0300!')).toBe('c, d!');
  });

  it('preserves initial marks that have no precomposed form and surrounding punctuation', () => {
    expect(firstLetterHint('"q\u0307\u0301uiet,"')).toBe('"q\u0307\u0301,"');
  });
});
