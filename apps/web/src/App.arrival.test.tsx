import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterAll, expect, it, vi } from 'vitest';
import type * as SchemaModule from './db/schema';

const startup = vi.hoisted(() => ({ pending: undefined as Promise<void> | undefined }));

vi.mock('./routes/router', async () => {
  const { createHashRouter } = await import('react-router-dom');
  return {
    router: createHashRouter([
      { path: '/', element: <h1>Today</h1> },
      { path: '/welcome', loader: () => startup.pending, element: <h1>Welcome</h1> },
      {
        path: '/start',
        loader: () => startup.pending,
        element: <h1>First practice example</h1>,
      },
    ]),
  };
});
vi.mock('./db/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaModule>()),
  ensurePreMigrationSnapshot: vi.fn().mockResolvedValue(undefined),
  openDatabase: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('./db/persistence', () => ({
  requestPersistentStorage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./db/seed', () => ({
  isFirstRun: vi.fn().mockResolvedValue(true),
  settleFirstRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./routes/idlePrefetch', () => ({
  scheduleBackgroundWork: () => () => {},
}));
vi.mock('./sync/triggers', () => ({ installSyncTriggers: () => () => {} }));
vi.mock('./hooks/useStorageQuotaWarning', () => ({ useStorageQuotaWarning: () => {} }));
vi.mock('./components/layout/LandingTransition', () => ({ LandingTransition: () => null }));

import { App } from './App';
import { router } from './routes/router';
import { db } from './db/schema';
import { markLandingHandover } from './landingHandover';

afterAll(() => router.dispose());

it.each([
  { handover: false, path: '/welcome', heading: 'Welcome' },
  { handover: true, path: '/start', heading: 'First practice example' },
])(
  'does not show Today while first-run $path is being prepared',
  async ({ handover, path, heading }) => {
    let release!: () => void;
    startup.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lacuna-lesson-view-mode-migrated', '1');
    await act(async () => router.navigate('/', { replace: true }));
    const hashSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.location),
      'hash',
    )?.set;
    if (!hashSetter) throw new Error('Location hash setter is unavailable');
    // Happy DOM updates the fragment without the browser's accompanying history event.
    const hash = vi.spyOn(window.location, 'hash', 'set').mockImplementation((value) => {
      hashSetter.call(window.location, value);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    if (handover) markLandingHandover();
    const count = vi.spyOn(db.courses, 'count').mockResolvedValue(0);
    const view = render(<App />);
    try {
      await waitFor(() => expect(router.state.navigation.location?.pathname).toBe(path));
      expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();
    } finally {
      await act(async () => release());
      await screen.findByRole('heading', { name: heading });
      view.unmount();
      count.mockRestore();
      hash.mockRestore();
    }
  },
);
