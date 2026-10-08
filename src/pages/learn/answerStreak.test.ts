import { describe, expect, it } from 'vitest';
import { isStreakMilestone, nextRun } from './answerStreak';

describe('answer streak', () => {
  it('extends on a correct answer and resets on a miss', () => {
    expect(nextRun(3, true)).toBe(4);
    expect(nextRun(3, false)).toBe(0);
  });

  it('celebrates every fifth answer in a row', () => {
    const milestones = Array.from({ length: 16 }, (_, run) => run).filter(isStreakMilestone);
    expect(milestones).toEqual([5, 10, 15]);
  });
});
