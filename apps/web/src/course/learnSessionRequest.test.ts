import { expect, it } from 'vitest';
import { resolveLearnSessionIds, resolveLearnSessionRequest } from './learnSessionRequest';

type RequestInput = Parameters<typeof resolveLearnSessionRequest>[0];

function resolve(overrides: Partial<RequestInput> = {}) {
  return resolveLearnSessionRequest({
    route: {},
    searchParams: new URLSearchParams(),
    studyMode: 'fsrs',
    lessonLearnFirst: undefined,
    ...overrides,
  });
}

it('replaces only the route identifiers owned by an embedded request', () => {
  const route = { courseId: 'route-course', lessonId: 'route-lesson' };
  expect(resolveLearnSessionIds({ kind: 'lesson', lessonId: 'requested-lesson' }, route)).toEqual({
    courseId: 'route-course',
    lessonId: 'requested-lesson',
  });
  expect(
    resolveLearnSessionIds(
      { kind: 'practice', courseId: 'requested-course', mode: 'recurring' },
      route,
    ),
  ).toEqual({ courseId: 'requested-course', lessonId: 'route-lesson' });
});

it.each([
  ['', ['due'], 'filtered-due'],
  ['mode=simple&filter=flagged&tag=biology', ['flagged', 'due'], 'filtered'],
  ['filter=due&filter=flagged&filter=due', ['due', 'flagged', 'due'], 'filtered'],
])(
  'combines recurring reviews with query filters without changing their order: %s',
  (query, filters, mode) => {
    const result = resolve({
      request: { kind: 'practice', courseId: 'course', mode: 'recurring' },
      searchParams: new URLSearchParams(query),
      studyMode: 'simple',
    });
    expect(result).toMatchObject({
      standaloneSimple: false,
      isSimpleMode: false,
      filterParams: filters,
      mode,
    });
    expect(result.tagFilter).toBe(query.includes('tag=') ? 'biology' : null);
  },
);

it.each(['exam', 'catch-up'] as const)(
  'keeps %s scheduled without implying a due-only filter',
  (mode) => {
    expect(
      resolve({
        request: { kind: 'practice', courseId: 'course', mode },
        studyMode: 'simple',
      }),
    ).toMatchObject({
      isSimpleMode: false,
      mode: 'fsrs',
      filterParams: [],
      examPractice: mode === 'exam',
      catchUpPractice: mode === 'catch-up',
    });
  },
);

it('keeps curricular scope and milestones when specification practice overrides the preference', () => {
  const request = {
    kind: 'practice',
    courseId: 'course',
    mode: 'curricular',
    nodeKey: 'node',
    scopeLessonIds: ['current'],
    milestoneLessonIds: ['prefix', 'current'],
    reviewLimit: 10,
  } as const;
  const scope = [...request.scopeLessonIds];
  const milestones = [...request.milestoneLessonIds];
  const curricular = { ...request, scopeLessonIds: scope, milestoneLessonIds: milestones };
  expect(resolve({ request: curricular, studyMode: 'simple' }).mode).toBe('simple');
  const result = resolve({
    request: { ...curricular, specificationPointId: 'point' },
    studyMode: 'simple',
  });
  expect(result).toMatchObject({
    mode: 'fsrs',
    requestSpecificationPointId: 'point',
    requestReviewLimit: 10,
    practiceNodeKeyParam: 'node',
  });
  expect(result.requestScopeLessonIds).toBe(scope);
  expect(result.requestMilestoneLessonIds).toBe(milestones);
});

it.each([
  ['fsrs', 'plan', 'window', true, 'cram'],
  ['simple', 'plan', 'window', true, 'simple'],
  ['fsrs', undefined, 'window', false, 'filtered-due'],
  ['fsrs', 'plan', undefined, false, 'filtered-due'],
] as const)(
  'preserves assessment mode precedence for %s, plan %s, window %s',
  (studyMode, planId, windowId, plannedRevision, mode) => {
    expect(
      resolve({
        request: {
          kind: 'practice',
          courseId: 'course',
          mode: 'assessment',
          assessmentId: 'assessment',
          planId,
          windowId,
        },
        searchParams: new URLSearchParams('filter=due'),
        studyMode,
      }),
    ).toMatchObject({
      plannedRevision,
      mode,
      reviewSessionKind: 'assessment-revision',
      requestPlanId: planId,
      requestWindowId: windowId,
    });
  },
);

it('lets the explicit standalone pass override the lesson setting and query filter', () => {
  const input = {
    route: { lessonId: 'lesson' },
    lessonLearnFirst: false,
    studyMode: 'simple',
  } as const;
  expect(resolve(input)).toMatchObject({ isSimpleMode: false, mode: 'fsrs' });
  expect(
    resolve({ ...input, searchParams: new URLSearchParams('mode=simple&filter=due') }),
  ).toMatchObject({
    standaloneSimple: true,
    isSimpleMode: true,
    mode: 'simple',
    filterParams: ['due'],
  });
});
