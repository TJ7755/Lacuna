import { describe, expect, it } from 'vitest';
import { gradeQuestionAttempt } from '@lacuna/core/questions/grading';

describe('gradeQuestionAttempt', () => {
  it.each([
    { earned: 4, available: 4, undetermined: false, disputed: false, expected: 3 },
    { earned: 3, available: 4, undetermined: false, disputed: false, expected: 2 },
    { earned: 3, available: 5, undetermined: false, disputed: false, expected: 2 },
    { earned: 60, available: 100, undetermined: false, disputed: false, expected: 2 },
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

  it('never lowers a grade as integer marks increase or awards Easy', () => {
    for (let available = 1; available <= 100; available++) {
      let previous = 1;
      for (let earned = 0; earned <= available; earned++) {
        const grade = gradeQuestionAttempt({
          marksEarned: earned,
          marksAvailable: available,
          hasUndeterminedVerdict: false,
          hasUnresolvedDispute: false,
        });
        expect(grade).toBeGreaterThanOrEqual(previous);
        expect(grade).toBeLessThanOrEqual(3);
        previous = grade!;
      }
    }
  });
});
