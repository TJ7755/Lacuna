import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PageLoading, PageLoadingBoundary } from './PageLoadingBoundary';

afterEach(() => vi.useRealTimers());

it('uses one delay and minimum lifetime across guard, chunk and page data', async () => {
  vi.useFakeTimers();
  function Page({ stage }: { stage: string }) {
    return (
      <>
        <header>Course navigation and View/Edit</header>
        <PageLoadingBoundary fallback={<p>Shared skeleton</p>}>
          {stage === 'ready' ? <p>Course content</p> : <PageLoading key={stage} />}
        </PageLoadingBoundary>
      </>
    );
  }
  const { rerender } = render(<Page stage="guard" />);
  await act(() => vi.advanceTimersByTime(150));
  rerender(<Page stage="chunk" />);
  await act(() => vi.advanceTimersByTime(50));
  expect(screen.getByText('Shared skeleton')).toBeVisible();
  rerender(<Page stage="data" />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByText('Course navigation and View/Edit')).toBeVisible();
  rerender(<Page stage="ready" />);
  expect(screen.getByText('Course content')).not.toBeVisible();
  await act(() => vi.advanceTimersByTime(200));
  expect(screen.getByText('Course content')).toBeVisible();
  expect(screen.queryByText('Shared skeleton')).not.toBeInTheDocument();
});
