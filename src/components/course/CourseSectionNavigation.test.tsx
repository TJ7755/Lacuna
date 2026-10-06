import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCourseTitleInView } from './CourseSectionNavigation';

let report: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

it('tracks whether the route’s course title is on screen', () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof report) {
        report = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  document.body.innerHTML =
    '<div data-route-content="/course/c1"><h1 data-course-title>Biology</h1></div>';
  const { result } = renderHook(() => useCourseTitleInView('/course/c1'));
  act(() => report([{ isIntersecting: true }]));
  expect(result.current).toBe(true);
  act(() => report([{ isIntersecting: false }]));
  expect(result.current).toBe(false);
});

it('reports no title on pages without one', () => {
  document.body.innerHTML = '<div data-route-content="/course/c1/cards"><h1>Cards</h1></div>';
  const { result } = renderHook(() => useCourseTitleInView('/course/c1/cards'));
  expect(result.current).toBe(false);
});

it('observes the course title when asynchronous route content arrives', async () => {
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof report) { report = callback; }
    observe = observe;
    disconnect() {}
  });
  document.body.innerHTML = '<div data-route-content="/course/c1"><p>Loading…</p></div>';
  const { result } = renderHook(() => useCourseTitleInView('/course/c1'));
  const title = document.createElement('h1');
  title.dataset.courseTitle = '';
  title.textContent = 'Biology';
  document.querySelector('[data-route-content]')!.append(title);
  await waitFor(() => expect(observe).toHaveBeenCalledWith(title));
  act(() => report([{ isIntersecting: true }]));
  expect(result.current).toBe(true);
});
