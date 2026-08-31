import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NavigationGuard, type NavigationGuardHandle } from './NavigationGuard';

function GuardedPage({
  onAttempt,
  onConfirm,
}: {
  onAttempt?: () => void;
  onConfirm?: () => void | Promise<void>;
}) {
  return (
    <>
      <NavigationGuard
        active
        onAttempt={onAttempt}
        onConfirm={onConfirm}
        title="Leave this editor?"
        message="Your draft will be kept."
      />
      <Link to="/away">Go away</Link>
    </>
  );
}

function renderGuarded(options: Parameters<typeof GuardedPage>[0] = {}) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <GuardedPage {...options} /> },
      { path: '/away', element: <p>Destination</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return router;
}

describe('NavigationGuard', () => {
  it('blocks route navigation, flushes synchronously and keeps editing by default', async () => {
    const onAttempt = vi.fn();
    renderGuarded({ onAttempt });

    fireEvent.click(screen.getByRole('link', { name: 'Go away' }));

    expect(onAttempt).toHaveBeenCalledTimes(1);
    const dialog = await screen.findByRole('dialog', { name: 'Leave this editor?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Destination')).not.toBeInTheDocument();
  });

  it('awaits confirmation before proceeding', async () => {
    let resolveConfirmation!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (resolveConfirmation = resolve)));
    renderGuarded({ onConfirm });

    fireEvent.click(screen.getByRole('link', { name: 'Go away' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Destination')).not.toBeInTheDocument();
    resolveConfirmation();
    expect(await screen.findByText('Destination')).toBeInTheDocument();
  });

  it('stays put when confirmation fails', async () => {
    renderGuarded({ onConfirm: () => Promise.reject(new Error('No')) });

    fireEvent.click(screen.getByRole('link', { name: 'Go away' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Leave this editor?' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Destination')).not.toBeInTheDocument();
  });

  it('flushes during beforeunload and asks the browser to confirm', () => {
    const onAttempt = vi.fn();
    renderGuarded({ onAttempt });
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('guards explicit exits which do not use the router', async () => {
    const guardRef = createRef<NavigationGuardHandle>();
    const onAttempt = vi.fn();
    const onExplicitLeave = vi.fn();
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <NavigationGuard
              ref={guardRef}
              active
              title="Leave the session?"
              message="Progress will be kept."
              onAttempt={onAttempt}
              onExplicitLeave={onExplicitLeave}
            />
            <button type="button" onClick={() => guardRef.current?.requestLeave()}>
              Exit
            </button>
          </>
        ),
      },
    ]);
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(onExplicitLeave).toHaveBeenCalledTimes(1));
  });
});
