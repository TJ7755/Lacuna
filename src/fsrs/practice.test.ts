import { describe, it, expect } from 'vitest';
import { shouldInsertPractice } from './practice';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Course } from '../db/types';

const NOW = 1_700_000_000_000;

/** A course with the practice thresholds at their defaults; examDate is overridable. */
function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'c1',
    name: 'Course',
    description: '',
    createdAt: NOW,
    examDate: NOW + 30 * MS_PER_DAY, // far by default
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 60,
    practiceThresholdMinutesNear: 30,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
    ...overrides,
  };
}

describe('shouldInsertPractice', () => {
  it('triggers when minutes-to-clear crosses the far threshold (exam not near)', () => {
    // 400 cards * 10s / 60 = 66.7 min >= 60.
    expect(shouldInsertPractice(makeCourse(), 400, 0, 10, NOW)).toBe(true);
  });

  it('does not trigger when below the threshold and within the gap backstop', () => {
    // 100 cards * 10s / 60 = 16.7 min < 60, and 0 lessons < maxGap 5.
    expect(shouldInsertPractice(makeCourse(), 100, 0, 10, NOW)).toBe(false);
  });

  it('uses the tighter near threshold when the exam is within the urgent window', () => {
    const course = makeCourse({ examDate: NOW + 3 * MS_PER_DAY });
    // 200 cards * 10s / 60 = 33.3 min: above near (30) but below far (60).
    expect(shouldInsertPractice(course, 200, 0, 10, NOW)).toBe(true);
    // The same volume would not trigger under the far threshold (exam far away).
    expect(shouldInsertPractice(makeCourse(), 200, 0, 10, NOW)).toBe(false);
  });

  it('treats the urgent-window boundary as inclusive', () => {
    // Exactly 7 days out: daysUntil = 7, which is <= practiceUrgentWindowDays.
    const course = makeCourse({ examDate: NOW + 7 * MS_PER_DAY });
    // 200 cards * 10s / 60 = 33.3 min >= near (30) but < far (60).
    expect(shouldInsertPractice(course, 200, 0, 10, NOW)).toBe(true);
  });

  it('fires the max-gap backstop even with no due cards', () => {
    expect(shouldInsertPractice(makeCourse(), 0, 5, 10, NOW)).toBe(true);
  });
});
