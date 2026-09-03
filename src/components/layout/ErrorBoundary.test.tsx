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
});
