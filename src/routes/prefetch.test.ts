import { describe, expect, it, vi } from 'vitest';

const loaders = vi.hoisted(() => ({
  loadAnalytics: vi.fn(() => Promise.resolve()),
  loadArchivedCourses: vi.fn(() => Promise.resolve()),
  loadCoursePath: vi.fn(() => Promise.resolve()),
  loadHelpPage: vi.fn(() => Promise.resolve()),
  loadLessonView: vi.fn(() => Promise.resolve()),
  loadSearchPage: vi.fn(() => Promise.resolve()),
  loadSettings: vi.fn(() => Promise.resolve()),
  loadSharePage: vi.fn(() => Promise.resolve()),
}));

vi.mock('./loaders', () => loaders);

import { prefetchRoute } from './prefetch';

describe('prefetchRoute', () => {
  it('loads each route chunk once and distinguishes course route families', () => {
    prefetchRoute('/analytics');
    prefetchRoute('/analytics');
    prefetchRoute('/archived');
    prefetchRoute('/course/course-1');
    prefetchRoute('/course/course-1/lesson/lesson-1');
    prefetchRoute('/unknown');

    expect(loaders.loadAnalytics).toHaveBeenCalledOnce();
    expect(loaders.loadArchivedCourses).toHaveBeenCalledOnce();
    expect(loaders.loadCoursePath).toHaveBeenCalledOnce();
    expect(loaders.loadLessonView).toHaveBeenCalledOnce();
    expect(loaders.loadHelpPage).not.toHaveBeenCalled();
  });
});
