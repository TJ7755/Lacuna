import { describe, expect, it } from 'vitest';
import { firstWordsHint } from './firstWordsHint';

describe('firstWordsHint', () => {
  it('reduces each comma-separated clause to its first word', () => {
    expect(firstWordsHint('To be, or not to be, that is the question')).toBe(
      'To…, or…, that…',
    );
  });

  it('leaves a single-word clause unchanged (nothing to hide)', () => {
    expect(firstWordsHint('Hello world, goodbye')).toBe('Hello…, goodbye');
  });

  it('handles a single clause with no punctuation', () => {
    expect(firstWordsHint('Hello world')).toBe('Hello…');
  });

  it('leaves a single word answer unchanged', () => {
    expect(firstWordsHint('Hello')).toBe('Hello');
  });

  it('preserves spacing around an em dash boundary', () => {
    expect(firstWordsHint('wait — really now')).toBe('wait — really…');
  });

  it('splits on semicolons and colons too', () => {
    expect(firstWordsHint('first thing; second thing: third thing')).toBe(
      'first…; second…: third…',
    );
  });

  it('does not leave a dangling clause for trailing punctuation', () => {
    expect(firstWordsHint('Wait a moment.')).toBe('Wait….');
  });

  it('collapses irregular whitespace within a clause', () => {
    expect(firstWordsHint('  one   two  three ')).toBe('one…');
  });

  it('returns an empty string for empty input', () => {
    expect(firstWordsHint('')).toBe('');
  });

  it('handles multiple sentences', () => {
    expect(firstWordsHint('First sentence here. Second one now.')).toBe(
      'First…. Second….',
    );
  });
});
