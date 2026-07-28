import { describe, expect, it } from 'vitest';
import { runWorkingFixtures } from './fixtureRunner';

describe('runWorkingFixtures', () => {
  it('uses the study verifier and reports the actual score', () => {
    const [result] = runWorkingFixtures(
      [{ marks: 1, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] }],
      [{ id: 'fixture-1', studentAnswer: ['4'], expectedMarks: 1 }],
    );

    expect(result).toMatchObject({ marksEarned: 1, passes: true });
  });
});
