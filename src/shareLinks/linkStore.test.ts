import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearShareImport,
  getCourseIdForShare,
  getShareIdForCourse,
  recordShareImport,
} from './linkStore';

const SHARE_A = 'a'.repeat(32);
const SHARE_B = 'b'.repeat(32);

beforeEach(() => {
  localStorage.clear();
});

describe('share link store', () => {
  it('round-trips a share import in both directions', () => {
    recordShareImport(SHARE_A, 'course-1');
    expect(getCourseIdForShare(SHARE_A)).toBe('course-1');
    expect(getShareIdForCourse('course-1')).toBe(SHARE_A);
  });

  it('replaces the course recorded for a share code', () => {
    recordShareImport(SHARE_A, 'course-1');
    recordShareImport(SHARE_A, 'course-2');
    expect(getCourseIdForShare(SHARE_A)).toBe('course-2');
    expect(getShareIdForCourse('course-1')).toBeNull();
  });

  it('rejects invalid share ids', () => {
    expect(() => recordShareImport('short', 'course-1')).toThrow('share link code is invalid');
    expect(() => recordShareImport('LAC1-text-code', 'course-1')).toThrow(
      'share link code is invalid',
    );
    expect(() => getCourseIdForShare('short')).toThrow('share link code is invalid');
    expect(() => clearShareImport('short')).toThrow('share link code is invalid');
    expect(getCourseIdForShare(SHARE_A)).toBeNull();
  });

  it('rejects an empty course id', () => {
    expect(() => recordShareImport(SHARE_A, '')).toThrow('course id is missing');
    expect(getCourseIdForShare(SHARE_A)).toBeNull();
  });

  it('returns null for missing keys', () => {
    expect(getCourseIdForShare(SHARE_A)).toBeNull();
    expect(getShareIdForCourse('course-1')).toBeNull();
    expect(getShareIdForCourse('')).toBeNull();
  });

  it('forgets a share import without touching the others', () => {
    recordShareImport(SHARE_A, 'course-1');
    recordShareImport(SHARE_B, 'course-2');
    clearShareImport(SHARE_A);
    expect(getCourseIdForShare(SHARE_A)).toBeNull();
    expect(getShareIdForCourse('course-1')).toBeNull();
    expect(getCourseIdForShare(SHARE_B)).toBe('course-2');
    clearShareImport(SHARE_A);
  });

  it('treats corrupt storage as absent', () => {
    localStorage.setItem('lacuna.shareImports', '{broken');
    expect(getCourseIdForShare(SHARE_A)).toBeNull();
    recordShareImport(SHARE_A, 'course-1');
    expect(getCourseIdForShare(SHARE_A)).toBe('course-1');
  });
});
