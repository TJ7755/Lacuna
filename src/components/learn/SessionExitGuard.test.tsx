import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NavigationGuardHandle } from '../ui/NavigationGuard';
import { SessionExitGuard } from './SessionExitGuard';

describe('SessionExitGuard', () => {
  it('uses the safe Stay action by default for an explicit Question exit', async () => {
    const guardRef = createRef<NavigationGuardHandle>();
    const onExplicitLeave = vi.fn();
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <SessionExitGuard
              ref={guardRef}
              active
              itemName="Question"
              answeredCount={3}
              totalCount={10}
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

    const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
    expect(dialog).toHaveTextContent(
      '3 of 10 Questions answered. Your recorded answers are safe, but the current Question will be abandoned.',
    );
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(onExplicitLeave).not.toHaveBeenCalled();
  });

  it('runs abandonment before an explicit leave', async () => {
    const guardRef = createRef<NavigationGuardHandle>();
    const calls: string[] = [];
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <SessionExitGuard
              ref={guardRef}
              active
              itemName="Card"
              answeredCount={1}
              totalCount={4}
              onConfirm={() => calls.push('confirm')}
              onExplicitLeave={() => calls.push('leave')}
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
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(calls).toEqual(['confirm', 'leave']));
  });
});
