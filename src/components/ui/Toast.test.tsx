import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';
import { renderHook } from '@testing-library/react';
import { Profiler } from 'react';

function TestComponent() {
  const { notify } = useToast();
  return (
    <div>
      <button onClick={() => notify('Hello world')}>Notify</button>
      <button onClick={() => notify('Error', 'negative')}>Error</button>
      <button
        onClick={() => notify('Action', 'neutral', { actionLabel: 'Undo', onAction: vi.fn() })}
      >
        Action
      </button>
      <button onClick={() => notify('First answer', 'neutral', { replaceKey: 'answer' })}>
        First answer
      </button>
      <button onClick={() => notify('Second answer', 'neutral', { replaceKey: 'answer' })}>
        Second answer
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Content</div>
      </ToastProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows a toast notification', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Notify'));
    await waitFor(() =>
      expect(screen.getByText('Hello world', { selector: 'span' })).toBeInTheDocument(),
    );
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
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    await waitFor(() =>
      expect(screen.getByText('Error', { selector: 'span' })).toBeInTheDocument(),
    );
  });

  it('shows an action button', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Action'));
    await waitFor(() => expect(screen.getByText('Undo')).toBeInTheDocument());
  });

  it('replaces a keyed toast so stale actions cannot remain visible', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'First answer' }));
    await screen.findByText('First answer', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Second answer' }));

    await waitFor(() => {
      expect(screen.queryByText('First answer', { selector: 'span' })).not.toBeInTheDocument();
      expect(screen.getByText('Second answer', { selector: 'span' })).toBeInTheDocument();
    });
  });

  it('updates the countdown by transform without changing its width', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    const bar = screen.getByLabelText('Notifications').querySelector('.origin-left') as HTMLElement;
    expect(bar.style.width).toBe('');
    expect(bar.style.transform).toBe('scaleX(1)');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(bar.style.width).toBe('');
    expect(bar.style.transform).not.toBe('scaleX(1)');
  });

  it('does not commit a React render for each countdown frame', async () => {
    const onRender = vi.fn();
    render(
      <Profiler id="toast" onRender={onRender}>
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      </Profiler>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    const commitsAfterOpening = onRender.mock.calls.length;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(onRender).toHaveBeenCalledTimes(commitsAfterOpening);
  });

  it('pauses dismissal on hover and resumes with the remaining time', async () => {
    const onDismiss = vi.fn();
    function TimedToast() {
      const { notify } = useToast();
      return (
        <button onClick={() => notify('Timed', 'neutral', { duration: 500, onDismiss })}>
          Show timed toast
        </button>
      );
    }
    render(
      <ToastProvider>
        <TimedToast />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show timed toast' }));
    const toast = screen.getByText('Timed').closest('.relative') as HTMLElement;
    fireEvent.mouseEnter(toast);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(screen.getByText('Timed')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1), { timeout: 1000 });
    await waitFor(() => expect(screen.queryByText('Timed')).not.toBeInTheDocument());
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
