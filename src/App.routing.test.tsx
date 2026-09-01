import { act, render, screen } from '@testing-library/react';
import { Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./components/layout/RouteTransition', () => ({ RouteTransition: Outlet }));
vi.mock('./components/layout/AppShell', () => ({ AppShell: Outlet }));
vi.mock('./pages/Dashboard', () => ({ Dashboard: () => <h1>Dashboard</h1> }));
vi.mock('./pages/NotFound', () => ({ NotFound: () => <h1>Not found</h1> }));

import { router } from './App';

describe('application routes', () => {
  it('redirects a Deck bookmark to the dashboard', async () => {
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await act(async () => {
      await router.navigate('/deck/anything');
    });

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Not found' })).not.toBeInTheDocument();
  });

  it('opens the public download route outside the application shell', async () => {
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await act(async () => {
      await router.navigate('/download');
    });

    expect(await screen.findByRole('heading', { name: 'Download Lacuna.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Not found' })).not.toBeInTheDocument();
  });
});
