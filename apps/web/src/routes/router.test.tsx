import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useSearchParams } from 'react-router-dom';
import { expect, it } from 'vitest';
import { router } from './router';

it('does not register the removed share prototype route', () => {
  const appRoutes = router.routes[0]?.children?.[0]?.children ?? [];
  expect(appRoutes.map((route) => route.path)).not.toContain('share-prototype');
});

it('preserves every typed character and focus while updating the current page query', async () => {
  function Search() {
    const [query, setQuery] = useSearchParams();
    return (
      <input
        aria-label="Search"
        value={query.get('q') ?? ''}
        onChange={(event) => setQuery({ q: event.target.value }, { replace: true })}
      />
    );
  }
  const appRoot = router.routes[0];
  const memory = createMemoryRouter(
    [
      {
        loader: appRoot.loader,
        shouldRevalidate: appRoot.shouldRevalidate,
        hydrateFallbackElement: null,
        element: <Outlet />,
        children: [{ path: '/search', element: <Search /> }],
      },
    ],
    { initialEntries: ['/search'] },
  );
  const view = render(<RouterProvider router={memory} />);
  try {
    const field = await screen.findByRole('textbox', { name: 'Search' });
    field.focus();
    for (const character of 'cell') {
      fireEvent.change(field, { target: { value: (field as HTMLInputElement).value + character } });
    }
    await waitFor(() => expect(field).toHaveValue('cell'));
    expect(memory.state.location.search).toBe('?q=cell');
    expect(field).toHaveFocus();
  } finally {
    view.unmount();
    memory.dispose();
  }
});
