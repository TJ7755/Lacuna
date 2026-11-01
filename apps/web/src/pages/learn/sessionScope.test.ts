import { describe, expect, it } from 'vitest';
import { resolveLearnSessionScope } from './sessionScope';

const base = {
  courseId: undefined,
  lessonId: undefined,
  sessionId: undefined,
  tagFilter: null,
  filterParams: [],
  requestScopeLessonIds: undefined,
  practiceNodeKey: null,
  assessmentId: undefined,
  planId: undefined,
  windowId: undefined,
};

describe('resolveLearnSessionScope', () => {
  it('keeps equivalent rebuilt filter and lesson arrays on the same load identity', () => {
    const first = resolveLearnSessionScope({
      ...base,
      courseId: 'course-1',
      filterParams: ['due', 'flagged'],
      requestScopeLessonIds: ['lesson-1', 'lesson-2'],
    });
    const rebuilt = resolveLearnSessionScope({
      ...base,
      courseId: 'course-1',
      filterParams: ['due', 'flagged'],
      requestScopeLessonIds: ['lesson-1', 'lesson-2'],
    });
    expect(rebuilt.requestScopeLessonIdsKey).toBe(first.requestScopeLessonIdsKey);
    expect(rebuilt.filterParamsKey).toBe(first.filterParamsKey);
  });

  it('gives each assessment revision window its own resumable practice scope', () => {
    expect(
      resolveLearnSessionScope({
        ...base,
        courseId: 'course-1',
        sessionId: 'session-1',
        assessmentId: 'assessment-1',
        planId: 'plan-1',
        windowId: 'window-1',
      }).simpleSessionScope,
    ).toEqual({
      kind: 'practice',
      courseId: 'course-1',
      sessionId: 'session-1',
      nodeKey: undefined,
      lessonIds: undefined,
      assessmentId: 'assessment-1',
      planId: 'plan-1',
      windowId: 'window-1',
    });
  });
});
