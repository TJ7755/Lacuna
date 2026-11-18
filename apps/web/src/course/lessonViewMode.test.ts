import { describe, it, expect } from 'vitest';
import { canEditLessons, isLessonAuthoringMode, resolveLessonViewMode } from './lessonViewMode';
import { makeCourse } from './path.testFixtures';

describe('canEditLessons', () => {
  it('returns true for an ordinary course with no distributedCopy', () => {
    expect(canEditLessons(makeCourse({ id: 'c1' }))).toBe(true);
    expect(canEditLessons(makeCourse({ id: 'c2', lessonViewMode: 'study' }))).toBe(true);
    expect(canEditLessons(makeCourse({ id: 'c3', lessonViewMode: 'edit' }))).toBe(true);
  });

  it('returns false for a locked distributed copy', () => {
    const course = makeCourse({
      id: 'c1',
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    expect(canEditLessons(course)).toBe(false);
  });

  it('returns true for a detached (unlocked) distributed copy', () => {
    const course = makeCourse({
      id: 'c1',
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: false,
        autoAcceptUpdates: false,
      },
    });
    expect(canEditLessons(course)).toBe(true);
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

  it('forces study for a locked distributed copy even when the stored mode is edit', () => {
    const course = makeCourse({
      id: 'c1',
      lessonViewMode: 'edit',
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    expect(resolveLessonViewMode(course)).toBe('study');
    expect(isLessonAuthoringMode(course)).toBe(false);
  });
});

describe('isLessonAuthoringMode', () => {
  it('enables path authoring only for the resolved Edit mode', () => {
    expect(isLessonAuthoringMode(makeCourse({ id: 'c1', lessonViewMode: 'edit' }))).toBe(true);
    expect(isLessonAuthoringMode(makeCourse({ id: 'c2', lessonViewMode: 'study' }))).toBe(false);
    expect(isLessonAuthoringMode(makeCourse({ id: 'c3' }))).toBe(false);
  });
});
