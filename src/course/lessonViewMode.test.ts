import { describe, it, expect } from 'vitest';
import { canEditLessons, isLessonAuthoringMode, resolveLessonViewMode } from './lessonViewMode';
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
    practiceThresholdMinutesFar: 12,
    practiceThresholdMinutesNear: 6,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 3,
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
  it('falls back to study when the course has no explicit mode', () => {
    const course = makeCourse({ id: 'c1' });
    expect(resolveLessonViewMode(course)).toBe('study');
  });

  it('uses the course’s own explicit mode', () => {
    const editCourse = makeCourse({ id: 'c1', lessonViewMode: 'edit' });
    expect(resolveLessonViewMode(editCourse)).toBe('edit');

    const studyCourse = makeCourse({ id: 'c2', lessonViewMode: 'study' });
    expect(resolveLessonViewMode(studyCourse)).toBe('study');
  });
});

describe('isLessonAuthoringMode', () => {
  it('enables path authoring only for the resolved Edit mode', () => {
    expect(isLessonAuthoringMode(makeCourse({ id: 'c1', lessonViewMode: 'edit' }))).toBe(true);
    expect(isLessonAuthoringMode(makeCourse({ id: 'c2', lessonViewMode: 'study' }))).toBe(false);
    expect(isLessonAuthoringMode(makeCourse({ id: 'c3' }))).toBe(false);
  });
});
