import { describe, it, expect } from 'vitest';
import { canEditLessons, resolveLessonViewMode } from './lessonViewMode';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import type { Course } from '../db/types';

// ---------------------------------------------------------------------------
// Fixture helper (mirroring src/course/path.test.ts)
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    name: 'Test course',
    description: '',
    createdAt: 0,
    examDate: 7 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 60,
    practiceThresholdMinutesNear: 30,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
    ...overrides,
  };
}

describe('canEditLessons', () => {
  it('always returns true today (no locked-course concept exists yet)', () => {
    expect(canEditLessons(makeCourse({ id: 'c1' }))).toBe(true);
    expect(canEditLessons(makeCourse({ id: 'c2', lessonViewMode: 'study' }))).toBe(true);
    expect(canEditLessons(makeCourse({ id: 'c3', lessonViewMode: 'edit' }))).toBe(true);
  });
});

describe('resolveLessonViewMode', () => {
  it('inherits the global default when the course has no override', () => {
    const course = makeCourse({ id: 'c1' });
    expect(resolveLessonViewMode(course, 'study')).toBe('study');
    expect(resolveLessonViewMode(course, 'edit')).toBe('edit');
  });

  it('prefers the course override over the global default', () => {
    const course = makeCourse({ id: 'c1', lessonViewMode: 'edit' });
    expect(resolveLessonViewMode(course, 'study')).toBe('edit');

    const studyOverride = makeCourse({ id: 'c2', lessonViewMode: 'study' });
    expect(resolveLessonViewMode(studyOverride, 'edit')).toBe('study');
  });
});
