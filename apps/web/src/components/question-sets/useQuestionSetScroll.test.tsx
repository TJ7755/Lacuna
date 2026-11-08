import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuestionSetScroll } from './useQuestionSetScroll';

function Library() {
  const present = useIsPresent();
  const root = useQuestionSetScroll('reactivated-question-library');
  return (
    <motion.div
      ref={root}
      data-testid="library"
      inert={!present}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 10 }}
    >
      <button type="button">Open set</button>
    </motion.div>
  );
}

function Shell({ show }: { show: boolean }) {
  return (
    <main>
      <AnimatePresence initial={false}>{show && <Library key="library" />}</AnimatePresence>
    </main>
  );
}

function clampScroll(main: HTMLElement, initialMax: number) {
  let top = 0;
  let max = initialMax;
  // The test DOM has no layout engine to clamp an unreachable scroll position.
  Object.defineProperties(main, {
    scrollHeight: { get: () => main.clientHeight + max },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.min(max, value);
      },
    },
  });
  return (nextMax: number) => {
    max = nextMax;
  };
}

afterEach(() => vi.unstubAllGlobals());

it('restores an existing page reactivated before its departure finishes', async () => {
  sessionStorage.removeItem('reactivated-question-library');
  const view = render(<Shell show />);
  const main = view.getByRole('main');
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  main.scrollTop = 320;
  fireEvent.scroll(main);
  view.rerender(<Shell show={false} />);
  expect(view.getByTestId('library')).toHaveAttribute('inert');
  main.scrollTop = 0;
  fireEvent.scroll(main);
  expect(sessionStorage.getItem('reactivated-question-library')).toBe('320');
  view.rerender(<Shell show />);
  expect(view.getByTestId('library')).not.toHaveAttribute('inert');
  await waitFor(() => expect(main.scrollTop).toBe(320));
});

it('keeps the learner’s scroll when the remembered Questions position is out of reach', async () => {
  sessionStorage.setItem('reactivated-question-library', '900');
  const view = render(<Shell show />);
  const main = view.getByRole('main');
  clampScroll(main, 320);
  await waitFor(() => expect(main.scrollTop).toBe(320));
  main.scrollTop = 160;
  fireEvent.scroll(main);
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(main.scrollTop).toBe(160);
  expect(sessionStorage.getItem('reactivated-question-library')).toBe('160');
});

it.each([
  ['wheel', (main: HTMLElement) => fireEvent.wheel(main, { deltaY: 160 }), 320],
  ['Page Down', (main: HTMLElement) => fireEvent.keyDown(main, { key: 'PageDown' }), 320],
  ['Space', (main: HTMLElement) => fireEvent.keyDown(main, { key: ' ' }), 320],
  [
    'Space on a button',
    (main: HTMLElement) => fireEvent.keyDown(within(main).getByRole('button'), { key: ' ' }),
    900,
  ],
  ['touch', (main: HTMLElement) => fireEvent.touchMove(main, { touches: [{ clientY: 50 }] }), 320],
  ['no input', () => {}, 900],
] as const)('handles content growth after %s at the bottom', async (_, scroll, expectedTop) => {
  let resize: (() => void) | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(onResize: () => void) {
        resize = onResize;
      }
      observe() {}
      disconnect() {
        resize = undefined;
      }
    },
  );
  sessionStorage.setItem('reactivated-question-library', '900');
  const main = render(<Shell show />).getByRole('main');
  const grow = clampScroll(main, 320);
  await waitFor(() => expect(main.scrollTop).toBe(320));

  scroll(main);
  grow(1000);
  resize?.();
  expect(main.scrollTop).toBe(expectedTop);
});
