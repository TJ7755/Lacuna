import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { installStaleChunkRecovery } from '../pwa/staleChunkRecovery';
import { lazyRouteModule } from './routeModule';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it('waits for stale shell removal before reloading a failed deployment route', async () => {
  let finishCleanup!: () => void;
  const cleanup = new Promise<boolean>((resolve) => {
    finishCleanup = () => resolve(true);
  });
  const deleteCache = vi.fn(() => cleanup);
  vi.stubGlobal('caches', { keys: async () => ['old-shell'], delete: deleteCache });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const remove = installStaleChunkRecovery();
  const Route = lazyRouteModule(async () => {
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    throw new TypeError('Failed to fetch dynamically imported module: /assets/old-route.js');
  });

  try {
    render(
      <ErrorBoundary>
        <Suspense fallback={<p>Loading route</p>}>
          <Route />
        </Suspense>
      </ErrorBoundary>,
    );
    await waitFor(() => expect(deleteCache).toHaveBeenCalledWith('old-shell'));
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    finishCleanup();
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  } finally {
    finishCleanup();
    remove();
  }
});
