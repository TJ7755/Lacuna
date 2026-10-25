import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { lazyRouteModule, loadRouteModule, loadRouteModuleForNavigation } from './routeModule';

const recoverFromChunkFailure = vi.hoisted(() => vi.fn());
vi.mock('../pwa/staleChunkRecovery', () => ({ recoverFromChunkFailure }));

describe('route module prefetch', () => {
  it('renders a completed prefetch immediately without a suspense fallback', async () => {
    const loader = vi.fn(async () => ({ default: () => <h1>Prefetched route</h1> }));
    const Route = lazyRouteModule(loader);
    await loadRouteModule(loader);

    render(
      <Suspense fallback={<p>Loading route</p>}>
        <Route />
      </Suspense>,
    );

    expect(screen.getByRole('heading', { name: 'Prefetched route' })).toBeInTheDocument();
    expect(screen.queryByText('Loading route')).not.toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('shares an in-flight request and preserves cold-route state after it resolves', async () => {
    function Page() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>Count {count}</button>;
    }
    let resolve!: (module: { default: typeof Page }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ default: typeof Page }>((done) => {
          resolve = done;
        }),
    );
    const Route = lazyRouteModule(loader);
    const request = loadRouteModule(loader);
    expect(loadRouteModule(loader)).toBe(request);
    const content = () => (
      <Suspense fallback={<p>Loading route</p>}>
        <Route />
      </Suspense>
    );
    const { rerender } = render(content());
    expect(screen.getByText('Loading route')).toBeInTheDocument();

    resolve({ default: Page });
    fireEvent.click(await screen.findByRole('button', { name: 'Count 0' }));
    rerender(content());

    expect(screen.getByRole('button', { name: 'Count 1' })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });

  it.each(['intent', 'navigation'] as const)(
    'allows a later intent prefetch to replace a failed %s import',
    async (source) => {
      const module = { default: () => <h1>Retried route</h1> };
      const loader = vi
        .fn<() => Promise<typeof module>>()
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValueOnce(module);
      const failed =
        source === 'navigation' ? loadRouteModuleForNavigation(loader) : loadRouteModule(loader);
      await expect(failed).rejects.toThrow('Offline');
      await loadRouteModule(loader);
      const Route = lazyRouteModule(loader);
      render(
        <Suspense fallback={<p>Loading route</p>}>
          <Route />
        </Suspense>,
      );
      expect(screen.getByRole('heading', { name: 'Retried route' })).toBeInTheDocument();
    },
  );
  it('discards an import failure delivered after its navigation was aborted', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /page.js'))
      .mockResolvedValue({ default: () => <h1>Later visit</h1> });
    const controller = new AbortController();
    const obsolete = loadRouteModuleForNavigation(loader, controller.signal);
    controller.abort();
    await expect(obsolete).rejects.toThrow('Failed to fetch');
    const Route = lazyRouteModule(loader);
    render(
      <Suspense fallback={<p>Loading route</p>}>
        <Route />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: 'Later visit' })).toBeInTheDocument();
  });
});

describe('lazy route import recovery', () => {
  async function failedRoute(
    error = new TypeError('Failed to fetch dynamically imported module: /page.js'),
  ) {
    const { lazyRouteModule } = await import('./routeModule');
    const Route = lazyRouteModule(async () => {
      throw error;
    });
    return render(
      <ErrorBoundary>
        <Suspense fallback={<p>Loading route</p>}>
          <Route />
        </Suspense>
      </ErrorBoundary>,
    );
  }

  beforeEach(() => {
    // Spies survive afterEach restores for prototype-backed storage methods in
    // this environment, so scrub them before each test instead of relying on
    // ordering.
    vi.restoreAllMocks();
    sessionStorage.clear();
    recoverFromChunkFailure.mockReset();
    recoverFromChunkFailure.mockResolvedValue(false);
    vi.resetModules();
    vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps Suspense visible while shared recovery replaces the document', async () => {
    recoverFromChunkFailure.mockResolvedValue(true);
    await failedRoute();
    await waitFor(() => expect(recoverFromChunkFailure).toHaveBeenCalledOnce());
    expect(screen.getByText('Loading route')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('leaves module evaluation errors to the error boundary', async () => {
    await failedRoute(new Error('Broken module initialisation'));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does not reload for failed hover prefetches', async () => {
    await expect(
      loadRouteModule(async () => {
        throw new TypeError('Failed to fetch dynamically imported module: /page.js');
      }),
    ).rejects.toThrow('Failed to fetch');
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('keeps the error boundary when shared recovery is unavailable instead of looping', async () => {
    await failedRoute();

    await waitFor(() => expect(recoverFromChunkFailure).toHaveBeenCalledOnce());
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
