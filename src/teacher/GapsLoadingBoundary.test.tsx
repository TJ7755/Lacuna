import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GapsLoadingBoundary } from './GapsLoadingBoundary';

afterEach(() => vi.useRealTimers());

it('resumes a still-visible loading surface without another delay', async () => {
  vi.useFakeTimers();
  const content = (pending: boolean) => (
    <GapsLoadingBoundary pending={pending} fallback={<p>Reading reports</p>}>
      {pending ? null : <button>Open report</button>}
    </GapsLoadingBoundary>
  );
  const view = render(content(true));
  await act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('status', { name: 'Loading class' })).toBeInTheDocument();
  view.rerender(content(false));
  expect(screen.getByRole('button', { name: 'Open report' })).toBeEnabled();
  expect(screen.queryByRole('status', { name: 'Loading class' })).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(20));
  view.rerender(content(true));
  expect(screen.getByRole('status', { name: 'Loading class' })).toBeInTheDocument();
  view.rerender(content(false));
  await act(() => vi.advanceTimersByTime(460));
  expect(screen.queryByText('Reading reports')).not.toBeInTheDocument();
});
