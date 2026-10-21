import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CourseTitleTransition } from './CourseTitleTransition';

const { travel } = vi.hoisted(() => ({ travel: vi.fn() }));
vi.mock('motion', () => ({ animate: travel }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function scene(pathname: string, title = true) {
  return <>
    <span data-course-nav-title="">Biology</span>
    <div data-route-content={pathname}>
      {title && <h1 data-course-title-text="">Biology</h1>}
    </div>
  </>;
}

function prepare() {
  travel.mockReset();
  travel.mockReturnValue({ stop: vi.fn(), then: () => Promise.resolve() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const heading = this.tagName === 'H1';
    return { left: 40, top: heading ? 150 : 30, bottom: heading ? 198 : 50,
      right: 300, width: 260, height: heading ? 48 : 20, x: 40, y: 30, toJSON() {} };
  });
}

it('shows the Path heading in place when entering a course or reloading', async () => {
  prepare();
  render(<>
    {scene('/course/c1', false)}
    <CourseTitleTransition courseId="c1" pathname="/course/c1" multiplier={1} />
  </>);
  act(() => {
    const heading = document.createElement('h1');
    heading.dataset.courseTitleText = '';
    heading.textContent = 'Biology';
    document.querySelector('[data-route-content]')!.append(heading);
  });
  await act(async () => { await Promise.resolve(); });
  expect(travel).not.toHaveBeenCalled();
  expect(document.querySelector('[data-course-title-transition]')).toHaveStyle({ visibility: 'hidden' });
});

it('hides the departing Path heading while its route is still exiting', () => {
  prepare();
  const page = (pathname: string) => <>
    <span data-course-nav-title="">Biology</span>
    <div data-route-content="/course/c1"><h1 data-course-title-text="">Biology</h1></div>
    {pathname.endsWith('/settings') && <div data-route-content={pathname}><h1>Settings</h1></div>}
    <CourseTitleTransition courseId="c1" pathname={pathname} multiplier={1} />
  </>;
  const view = render(page('/course/c1'));
  view.rerender(page('/course/c1/settings'));
  expect(travel).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-course-title-text]')).toHaveStyle({ clipPath: 'inset(50%)' });
});

it('waits for a lazy Path heading before reversing the identity', async () => {
  prepare();
  const page = (pathname: string, title: boolean) => <>
    {scene(pathname, title)}
    <CourseTitleTransition courseId="c1" pathname={pathname} multiplier={1} />
  </>;
  const view = render(page('/course/c1/cards', false));
  view.rerender(page('/course/c1', false));
  expect(travel).not.toHaveBeenCalled();
  act(() => {
    const heading = document.createElement('h1');
    heading.dataset.courseTitleText = '';
    heading.textContent = 'Biology';
    document.querySelector('[data-route-content]')!.append(heading);
  });
  await waitFor(() => expect(travel).toHaveBeenCalledTimes(1));
});

it('changes endpoints immediately with reduced motion', () => {
  prepare();
  const page = (pathname: string, title: boolean) => <>
    {scene(pathname, title)}
    <CourseTitleTransition courseId="c1" pathname={pathname} multiplier={0} />
  </>;
  const view = render(page('/course/c1', true));
  view.rerender(page('/course/c1/cards', false));
  expect(travel).not.toHaveBeenCalled();
  expect(document.querySelector('[data-course-title-transition]')).toHaveStyle({ visibility: 'hidden' });
});

it('uses the renamed heading as the source of the next transition', async () => {
  prepare();
  const page = (pathname: string, title: boolean, name: string) => <>
    <span data-course-nav-title="">{name}</span>
    <div data-route-content={pathname}>{title && <h1 data-course-title-text="">{name}</h1>}</div>
    <CourseTitleTransition courseId="c1" pathname={pathname} multiplier={1} />
  </>;
  const view = render(page('/course/c1', true, 'Biology'));
  view.rerender(page('/course/c1', true, 'A longer course name'));
  await act(async () => { await Promise.resolve(); });
  view.rerender(page('/course/c1/cards', false, 'A longer course name'));
  await waitFor(() => expect(travel).toHaveBeenCalledTimes(1));
  expect(document.querySelector('[data-course-title-transition]')).toHaveTextContent('A longer course name');
  expect(travel.mock.calls[0][1]).toMatchObject({ top: [150, 30] });
});
