import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenLazyContent(): never {
  throw new Error('lazy chunk unavailable');
}

describe('ErrorBoundary', () => {
  it('reloads the page when retrying without a custom reset handler', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <BrokenLazyContent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reload).toHaveBeenCalledOnce();
    reload.mockRestore();
    errorLog.mockRestore();
  });

  it('leads with recovery, keeps diagnostics behind Technical details and reports copy failure', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <BrokenLazyContent />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getByText('lazy chunk unavailable').closest('details')).not.toHaveAttribute(
      'open',
    );
    fireEvent.click(screen.getByText('Technical details'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic details' }));
    expect(
      await screen.findByText('Could not copy. Download the bundle instead.'),
    ).toBeInTheDocument();
    errorLog.mockRestore();
  });
});
