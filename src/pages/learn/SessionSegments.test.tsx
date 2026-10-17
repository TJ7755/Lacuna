import { act, render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionSegments } from './SessionSegments';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('snaps backwards across a boundary and recomputes the window after resizing', async () => {
  let width = 810;
  let measure = () => {};
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const cardIds = Array.from({ length: 322 }, (_, index) => `card-${index}`);
  const props = { cardIds, outcomes: new Map(), value: 0.1, label: 'Session progress', m: 0 };
  const { rerender } = render(<SessionSegments {...props} currentCardIds={['card-12']} />, {
    wrapper: ({ children }) => <LazyMotion features={domAnimation}>{children}</LazyMotion>,
  });
  const row = screen.getByRole('progressbar').querySelector('[data-session-segment-row]')!;
  const pips = row.querySelectorAll('[data-session-card-status]');
  expect(pips).toHaveLength(322);
  expect(pips[0]).toHaveStyle({ width: '42px' });
  expect(row).toHaveStyle({ gap: '6px' });
  expect(row.parentElement).toHaveClass('h-2.5');

  rerender(<SessionSegments {...props} currentCardIds={['card-13']} />);
  await waitFor(() => expect(row).toHaveStyle({ transform: 'translateX(-480px)' }));
  rerender(<SessionSegments {...props} currentCardIds={['card-12']} />);
  await waitFor(() => expect(row).toHaveStyle({ transform: 'none' }));
  rerender(<SessionSegments {...props} currentCardIds={['card-13']} />);
  await waitFor(() => expect(row).toHaveStyle({ transform: 'translateX(-480px)' }));
  act(() => {
    width = 156;
    measure();
  });
  await waitFor(() => expect(row).toHaveStyle({ transform: 'translateX(-200px)' }));
  expect(pips[0]).toHaveStyle({ width: '16px' });
  expect(row).toHaveStyle({ gap: '4px' });
  expect(row.parentElement).toHaveClass('h-2');
  expect(screen.getByText('Card 14 of 322')).toBeInTheDocument();
});

it('keeps the original flexible pills and no mask when the session fits', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(796);
  render(
    <SessionSegments
      cardIds={['one', 'two', 'three']}
      currentCardIds={['two']}
      outcomes={new Map([['one', 'wrong']])}
      value={1 / 3}
      label="Session progress"
      m={0}
    />,
  );
  const row = screen.getByRole('progressbar').querySelector('[data-session-segment-row]')!;
  expect(row).toHaveStyle({ width: '100%' });
  expect(row.firstElementChild).toHaveClass('flex-1');
  expect(row.parentElement).toHaveStyle({ maskImage: '' });
});
