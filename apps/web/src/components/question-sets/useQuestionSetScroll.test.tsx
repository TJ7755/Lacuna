import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { expect, it } from 'vitest';
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
    />
  );
}

function Shell({ show }: { show: boolean }) {
  return (
    <main>
      <AnimatePresence initial={false}>{show && <Library key="library" />}</AnimatePresence>
    </main>
  );
}

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
