import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';
import { renderHook } from '@testing-library/react';

function TestComponent() {
  const { notify } = useToast();
  return (
    <div>
      <button onClick={() => notify('Hello world')}>Notify</button>
      <button onClick={() => notify('Error', 'negative')}>Error</button>
      <button onClick={() => notify('Action', 'neutral', { actionLabel: 'Undo', onAction: vi.fn() })}>Action</button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Content</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows a toast notification', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Notify'));
    await waitFor(() => expect(screen.getByText('Hello world', { selector: 'span' })).toBeInTheDocument());
  });

  it('announces each toast through the visible notification stack only once', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Notify'));

    await waitFor(() => {
      expect(screen.getAllByText('Hello world', { selector: 'span' })).toHaveLength(1);
    });
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(screen.getByLabelText('Notifications')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows different tones', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    await waitFor(() => expect(screen.getByText('Error', { selector: 'span' })).toBeInTheDocument());
  });

  it('shows an action button', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Action'));
    await waitFor(() => expect(screen.getByText('Undo')).toBeInTheDocument());
  });

  it('throws when useToast is called outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useToast())).toThrow(
        'useToast must be used within a ToastProvider',
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
