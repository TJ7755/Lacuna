import { describe, expect, it } from 'vitest';
import { countOf } from './plural';

describe('countOf', () => {
  it('uses the singular only for exactly one', () => {
    expect(countOf(0, 'card')).toBe('0 cards');
    expect(countOf(1, 'card')).toBe('1 card');
    expect(countOf(2, 'lesson')).toBe('2 lessons');
  });

  it('groups thousands', () => {
    expect(countOf(5002, 'card')).toBe('5,002 cards');
  });
});
