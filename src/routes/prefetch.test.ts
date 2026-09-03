import { describe, expect, it, vi } from 'vitest';

const loaders = vi.hoisted(() => ({
  loadAnalytics: vi.fn(() => Promise.resolve()),
  loadArchivedCourses: vi.fn(() => Promise.resolve()),
  loadCardsPage: vi.fn(() => Promise.resolve()),
  loadCourseAnalytics: vi.fn(() => Promise.resolve()),
  loadCoursePath: vi.fn(() => Promise.resolve()),
  loadCourseSettings: vi.fn(() => Promise.resolve()),
  loadHelpPage: vi.fn(() => Promise.resolve()),
  loadLessonView: vi.fn(() => Promise.resolve()),
  loadQuestionsPage: vi.fn(() => Promise.resolve()),
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
    prefetchRoute('/course/course-1/cards/new');
    prefetchRoute('/course/course-1/questions/question-1/edit');

    expect(loaders.loadCardsPage).not.toHaveBeenCalled();
    expect(loaders.loadQuestionsPage).not.toHaveBeenCalled();

    prefetchRoute('/course/course-1/cards');
    prefetchRoute('/course/course-1/questions');
    prefetchRoute('/course/course-1/analytics');
    prefetchRoute('/course/course-1/settings');
    prefetchRoute('/unknown');

    expect(loaders.loadAnalytics).toHaveBeenCalledOnce();
    expect(loaders.loadArchivedCourses).toHaveBeenCalledOnce();
    expect(loaders.loadCoursePath).toHaveBeenCalledOnce();
    expect(loaders.loadLessonView).toHaveBeenCalledOnce();
    expect(loaders.loadCardsPage).toHaveBeenCalledOnce();
    expect(loaders.loadQuestionsPage).toHaveBeenCalledOnce();
    expect(loaders.loadCourseAnalytics).toHaveBeenCalledOnce();
    expect(loaders.loadCourseSettings).toHaveBeenCalledOnce();
    expect(loaders.loadHelpPage).not.toHaveBeenCalled();
  });
});
