import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageLoading, PageLoadingBoundary } from './PageLoadingBoundary';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('page pending feedback', async () => {
  it('keeps fast transitions quiet and shows a delayed SVG without hiding live controls', async () => {
    const { rerender } = render(
      <PageLoadingBoundary pending animateArrival={false}>
        <button>Live control</button>
      </PageLoadingBoundary>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByRole('status', { name: 'Loading' }).querySelector('svg'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Live control' })).toBeEnabled();
    rerender(
      <PageLoadingBoundary animateArrival={false}>
        <button>Live control</button>
      </PageLoadingBoundary>,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears the timer when pending work finishes before the threshold', async () => {
    const { rerender } = render(
      <PageLoadingBoundary pending animateArrival={false}>
        Ready
      </PageLoadingBoundary>,
    );
    await act(() => vi.advanceTimersByTime(100));
    rerender(<PageLoadingBoundary animateArrival={false}>Ready</PageLoadingBoundary>);
    await act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('coalesces local dependencies and clears feedback when they unmount', async () => {
    const { rerender } = render(
      <PageLoadingBoundary animateArrival={false}>
        <PageLoading />
        <PageLoading />
      </PageLoadingBoundary>,
    );
    await act(() => vi.advanceTimersByTime(300));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    rerender(<PageLoadingBoundary animateArrival={false}>Ready</PageLoadingBoundary>);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('also reports a standalone pending dependency', async () => {
    render(<PageLoading />);
    await act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
