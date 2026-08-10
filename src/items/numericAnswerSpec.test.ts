import { describe, expect, it } from 'vitest';
import { numericAnswerSpecIsValid } from './numericAnswerSpec';

describe('numericAnswerSpecIsValid', () => {
  it('validates untrusted numeric answer shapes and constant expressions', () => {
    expect(numericAnswerSpecIsValid({ kind: 'exact', value: 'sqrt(16)' })).toBe(true);
    expect(numericAnswerSpecIsValid({ kind: 'within', value: '4', tolerance: 0.01 })).toBe(true);
    expect(numericAnswerSpecIsValid({ kind: 'matches-one-of', values: ['3', '4'] })).toBe(true);
    expect(numericAnswerSpecIsValid({ kind: 'exact', value: 'x' })).toBe(false);
    expect(numericAnswerSpecIsValid({ kind: 'within', value: '4', tolerance: -1 })).toBe(false);
    expect(numericAnswerSpecIsValid({ kind: 'anything', value: '4' })).toBe(false);
  });
});
