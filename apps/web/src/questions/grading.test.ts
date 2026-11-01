import { describe, expect, it } from 'vitest';
import { gradeQuestionAttempt } from './grading';

describe('gradeQuestionAttempt', () => {
  it.each([
    { earned: 4, available: 4, undetermined: false, disputed: false, expected: 3 },
    { earned: 3, available: 4, undetermined: false, disputed: false, expected: 1 },
    { earned: 0, available: 4, undetermined: false, disputed: false, expected: 1 },
  ])(
    'maps $earned/$available to grade $expected',
    ({ earned, available, undetermined, disputed, expected }) => {
      expect(
        gradeQuestionAttempt({
          marksEarned: earned,
          marksAvailable: available,
          hasUndeterminedVerdict: undetermined,
          hasUnresolvedDispute: disputed,
        }),
      ).toBe(expected);
    },
  );

  it('withholds scheduling when the checker abstained or the learner disputed it', () => {
    expect(
      gradeQuestionAttempt({
        marksEarned: 4,
        marksAvailable: 4,
        hasUndeterminedVerdict: true,
        hasUnresolvedDispute: false,
      }),
    ).toBeNull();
    expect(
      gradeQuestionAttempt({
        marksEarned: 4,
        marksAvailable: 4,
        hasUndeterminedVerdict: false,
        hasUnresolvedDispute: true,
      }),
    ).toBeNull();
  });

  it('never derives Easy from response speed', () => {
    expect(
      gradeQuestionAttempt({
        marksEarned: 1,
        marksAvailable: 1,
        hasUndeterminedVerdict: false,
        hasUnresolvedDispute: false,
      }),
    ).toBe(3);
  });
});
