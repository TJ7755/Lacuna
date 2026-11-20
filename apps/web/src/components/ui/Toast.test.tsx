import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';
import { renderHook } from '@testing-library/react';
import { Profiler } from 'react';
import * as motionSpeed from '../../state/motionSpeed';

function TestComponent() {
  const { notify } = useToast();
  return (
    <div>
      <button onClick={() => notify('Hello world')}>Notify</button>
      <button onClick={() => notify('Error', 'negative')}>Error</button>
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
  it('keeps error notices until explicitly dismissed by default', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));

    expect(screen.getByText('Error', { selector: 'span' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })));
    await waitFor(() =>
      expect(screen.queryByText('Error', { selector: 'span' })).not.toBeInTheDocument(),
    );
  });

  it('dismisses only the latest notice without taking focus or consuming an overlay Escape', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Error' });
    trigger.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    fireEvent.click(trigger);
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    await act(async () => window.dispatchEvent(handled));
    expect(screen.getByText('Error', { selector: 'span' })).toBeInTheDocument();
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    document.body.append(overlay);
    await act(async () => fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.getByText('Error', { selector: 'span' })).toBeInTheDocument();
    overlay.remove();
    await act(async () => fireEvent.keyDown(window, { key: 'Escape' }));
    await waitFor(() =>
      expect(screen.queryByText('Error', { selector: 'span' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('honours explicit timed error notices and persistent opt-outs', async () => {
    function TimedErrors() {
      const { notify } = useToast();
      return (
        <>
          <button onClick={() => notify('Short error', 'negative', { duration: 20 })}>
            Short error
          </button>
          <button onClick={() => notify('Default timer', 'negative', { persistent: false })}>
            Opt out
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <TimedErrors />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Short error' }));
    await waitFor(() =>
      expect(screen.queryByText('Short error', { selector: 'span' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Opt out' }));
    expect(screen.getByText('Default timer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('keeps persistent toasts untimed with working actions and Escape dismissal', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    function PersistentToast() {
      const { notify } = useToast();
      return (
        <button
          onClick={() =>
            notify('Keep this change?', 'positive', {
              persistent: true,
              duration: 20,
              actionLabel: 'Undo',
              onAction,
              onDismiss,
            })
          }
        >
          Show persistent toast
        </button>
      );
    }
    render(
      <ToastProvider>
        <PersistentToast />
      </ToastProvider>,
    );
    const show = screen.getByRole('button', { name: 'Show persistent toast' });
    fireEvent.click(show);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(screen.getByText('Keep this change?')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('Keep this change?')).not.toBeInTheDocument());

    fireEvent.click(show);
    await act(async () => {
      show.focus();
      const undo = screen.getByRole('button', { name: 'Undo' });
      undo.focus();
      fireEvent.keyDown(undo, { key: 'Escape' });
    });
    await waitFor(() => expect(show).toHaveFocus());
    expect(onAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Keep this change?')).not.toBeInTheDocument());
  });

  it('keeps a focused, protected action available through a burst of notifications', async () => {
    const onDismiss = vi.fn();
    function ActionToast() {
      const { notify } = useToast();
      return (
        <>
          <button
            onClick={() =>
              notify('Undoable change', 'neutral', {
                actionLabel: 'Undo',
                onAction: vi.fn(),
                duration: 150,
                onDismiss,
                keepVisible: true,
              })
            }
          >
            Show undo toast
          </button>
          <button
            onClick={() => {
              for (let index = 0; index < 5; index++) notify(`Notification ${index}`);
            }}
          >
            More notifications
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <ActionToast />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show undo toast' }));
    const undo = screen.getByRole('button', { name: 'Undo' });
    const toast = screen.getByText('Undoable change').closest('.relative') as HTMLElement;
    fireEvent.mouseEnter(toast);
    fireEvent.focus(undo);
    fireEvent.mouseLeave(toast);
    fireEvent.click(screen.getByRole('button', { name: 'More notifications' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.blur(undo, {
      relatedTarget: screen.getByRole('button', { name: 'Show undo toast' }),
    });
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
  });

  it('shows notifications immediately when motion is disabled', () => {
    const multiplier = vi.spyOn(motionSpeed, 'speedMultiplier').mockReturnValue(0);
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Notify'));
    expect(screen.getByText('Hello world').closest('.relative')).toBeVisible();
    multiplier.mockRestore();
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
