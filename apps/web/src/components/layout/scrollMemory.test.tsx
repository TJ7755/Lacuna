import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { clearScrollMemory, useScrollMemory } from './scrollMemory';

let go: ReturnType<typeof useNavigate>;

function Shell() {
  const ref = useRef<HTMLElement>(null);
  useScrollMemory(ref);
  go = useNavigate();
  return <main ref={ref} data-testid="main" style={{ overflowAnchor: 'auto' }} />;
}

function scrollTo(main: HTMLElement, top: number) {
  main.scrollTop = top;
  main.dispatchEvent(new Event('scroll'));
}

afterEach(() => {
  clearScrollMemory();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const view = render(
    <MemoryRouter initialEntries={['/course/c1/cards?q=cell']}>
      <Shell />
    </MemoryRouter>,
  );
  const main = view.getByTestId('main');
  // happy-dom does not lay out, so let scrollTo set the position directly.
  main.scrollTo = ((options: ScrollToOptions) => {
    main.scrollTop = options.top ?? 0;
  }) as typeof main.scrollTo;
  return main;
}

function mockResize() {
  let callback: (() => void) | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(onResize: () => void) {
        callback = onResize;
      }
      observe() {}
      disconnect() {
        callback = undefined;
      }
    },
  );
  return () => callback?.();
}

it('starts a new page at the top and restores the old one on Back', () => {
  const main = setup();
  scrollTo(main, 640);
  act(() => void go('/course/c1/cards/x/edit'));
  expect(main.scrollTop).toBe(0);
  act(() => void go(-1));
  expect(main.scrollTop).toBe(640);
});

it('restores the place for an in-app return', () => {
  const main = setup();
  scrollTo(main, 320);
  act(() => void go('/course/c1/cards/x/edit'));
  act(() => void go('/course/c1/cards?q=cell', { state: { returning: true } }));
  expect(main.scrollTop).toBe(320);
});

it('keeps its place when only the query changes', () => {
  const main = setup();
  scrollTo(main, 200);
  act(() => void go('/course/c1/cards?q=atom'));
  expect(main.scrollTop).toBe(200);
});

it('lets a learner scroll away while waiting for the saved position to become reachable', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  const resize = mockResize();
  const main = setup();
  scrollTo(main, 640);
  act(() => void go('/course/c1/cards/x/edit'));

  let maxScrollTop = 300;
  Object.defineProperty(main, 'scrollHeight', {
    get: () => main.clientHeight + maxScrollTop,
  });
  main.scrollTo = ((options: ScrollToOptions) => {
    main.scrollTop = Math.min(maxScrollTop, options.top ?? 0);
  }) as typeof main.scrollTo;

  act(() => void go(-1));
  expect(main.scrollTop).toBe(300);
  scrollTo(main, 180);
  maxScrollTop = 800;
  resize();
  vi.advanceTimersToNextFrame();
  expect(main.scrollTop).toBe(180);
});

it.each(['loaded', 'cancelled', 'timed out'])(
  'restores browser anchoring after a lazy return is %s',
  async (outcome) => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
    });
    const resize = mockResize();
    const main = setup();
    scrollTo(main, 640);
    act(() => void go('/course/c1/cards/x/edit'));
    const scroll = main.scrollTo;
    // The returning page cannot reach its saved position until its content loads.
    main.scrollTo = () => {};
    act(() => void go(-1));
    expect(main.style.overflowAnchor).toBe('none');
    if (outcome === 'loaded') {
      main.scrollTo = scroll;
      resize();
      vi.advanceTimersToNextFrame();
      expect(main.scrollTop).toBe(640);
    } else if (outcome === 'cancelled') {
      act(() => void go('/course/c2/cards'));
    } else {
      await act(() => vi.runAllTimers());
    }
    expect(main.style.overflowAnchor).toBe('auto');
  },
);
