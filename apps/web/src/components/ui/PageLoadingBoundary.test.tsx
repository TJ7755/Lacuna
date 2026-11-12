import { act, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageArrivalReady } from './PageArrival';
import { PageLoading, PageLoadingBoundary } from './PageLoadingBoundary';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function ArrivalState() {
  return <output aria-label="Arrival ready">{String(useContext(PageArrivalReady))}</output>;
}

describe('page pending feedback', () => {
  it('waits 300 ms, keeps controls live and removes feedback on readiness', async () => {
    const click = vi.fn();
    const { rerender } = render(
      <PageLoadingBoundary pending animateArrival={false}>
        <button onClick={click}>Live control</button>
        <ArrivalState />
      </PageLoadingBoundary>,
    );
    expect(screen.getByLabelText('Arrival ready')).toHaveTextContent('false');
    await act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    await act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: 'Loading' }).querySelector('svg')).not.toBeNull();
    act(() => screen.getByRole('button').click());
    expect(click).toHaveBeenCalledOnce();
    rerender(
      <PageLoadingBoundary animateArrival={false}>
        <ArrivalState />
      </PageLoadingBoundary>,
    );
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    expect(screen.getByLabelText('Arrival ready')).toHaveTextContent('true');
  });

  it('cancels fast waits and starts a fresh delay for the next wait', async () => {
    const { rerender, unmount } = render(
      <PageLoadingBoundary pending animateArrival={false}>
        Ready
      </PageLoadingBoundary>,
    );
    await act(() => vi.advanceTimersByTime(100));
    rerender(<PageLoadingBoundary animateArrival={false}>Ready</PageLoadingBoundary>);
    await act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <PageLoadingBoundary pending animateArrival={false}>
        Ready
      </PageLoadingBoundary>,
    );
    await act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces dependencies until the last one is ready without restarting the delay', async () => {
    function Dependencies({ first = true, second = true }) {
      return (
        <PageLoadingBoundary animateArrival={false}>
          {first && <PageLoading />}
          {second && <PageLoading />}
          <ArrivalState />
        </PageLoadingBoundary>
      );
    }
    const { rerender } = render(<Dependencies />);
    await act(() => vi.advanceTimersByTime(200));
    rerender(<Dependencies first={false} />);
    await act(() => vi.advanceTimersByTime(100));
    expect(screen.getAllByRole('status', { name: 'Loading' })).toHaveLength(1);
    expect(screen.getByLabelText('Arrival ready')).toHaveTextContent('false');
    rerender(<Dependencies first={false} second={false} />);
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    expect(screen.getByLabelText('Arrival ready')).toHaveTextContent('true');
  });

  it('delays standalone feedback and clears its timer on unmount', async () => {
    const { unmount } = render(<PageLoading />);
    await act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    unmount();
    expect(screen.queryByRole('status')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
