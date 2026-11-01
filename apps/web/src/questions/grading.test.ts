import { describe, expect, it } from 'vitest';
import { gradeQuestionAttempt } from './grading';

describe('gradeQuestionAttempt', () => {
  it.each([
    { earned: 4, available: 4, undetermined: false, disputed: false, expected: 3 },
    { earned: 3, available: 4, undetermined: false, disputed: false, expected: 2 },
    { earned: 3, available: 5, undetermined: false, disputed: false, expected: 2 },
    { earned: 59, available: 100, undetermined: false, disputed: false, expected: 1 },
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

  it('maps every integer boundary monotonically', () => {
    for (let available = 1; available <= 100; available++) {
      for (let earned = 0; earned <= available; earned++) {
        expect(
          gradeQuestionAttempt({
            marksEarned: earned,
            marksAvailable: available,
            hasUndeterminedVerdict: false,
            hasUnresolvedDispute: false,
          }),
        ).toBe(earned === available ? 3 : earned * 5 >= available * 3 ? 2 : 1);
      }
    }
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
