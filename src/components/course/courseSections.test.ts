import { describe, expect, it } from 'vitest';
import { courseSectionPath, matchCourseSection } from './courseSections';

describe('matchCourseSection', () => {
  it('identifies each section in tab order', () => {
    expect(matchCourseSection('/course/abc')).toEqual({ courseId: 'abc', index: 0 });
    expect(matchCourseSection('/course/abc/bank')).toEqual({ courseId: 'abc', index: 1 });
    expect(matchCourseSection('/course/abc/analytics')).toEqual({ courseId: 'abc', index: 2 });
    expect(matchCourseSection('/course/abc/settings')).toEqual({ courseId: 'abc', index: 3 });
  });

  it('ignores routes that are destinations within a section rather than siblings of it', () => {
    // Sliding or swiping between these and a sibling section would misrepresent the move.
    expect(matchCourseSection('/course/abc/lesson/l1')).toBeNull();
    expect(matchCourseSection('/course/abc/cards/new')).toBeNull();
    expect(matchCourseSection('/course/abc/updates')).toBeNull();
  });

  it('ignores routes outside a course', () => {
    expect(matchCourseSection('/')).toBeNull();
    expect(matchCourseSection('/analytics')).toBeNull();
    expect(matchCourseSection('/learn')).toBeNull();
  });
});

describe('courseSectionPath', () => {
  it('builds the path for a section index', () => {
    expect(courseSectionPath('abc', 0)).toBe('/course/abc');
    expect(courseSectionPath('abc', 2)).toBe('/course/abc/analytics');
  });

  it('returns null beyond either end, so a swipe at the edge does nothing', () => {
    expect(courseSectionPath('abc', -1)).toBeNull();
    expect(courseSectionPath('abc', 4)).toBeNull();
  });
});
