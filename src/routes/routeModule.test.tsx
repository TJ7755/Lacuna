import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { lazyRouteModule, loadRouteModule } from './routeModule';

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

  it('allows a failed prefetch to be retried before navigation', async () => {
    const module = { default: () => <h1>Retried route</h1> };
    const loader = vi
      .fn<() => Promise<typeof module>>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(module);
    await expect(loadRouteModule(loader)).rejects.toThrow('Offline');
    await expect(loadRouteModule(loader)).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(2);
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
    sessionStorage.clear();
    vi.resetModules();
    vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads a failed route once across document loads, then shows the boundary', async () => {
    const first = await failedRoute();
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce());
    first.unmount();
    vi.resetModules();
    await failedRoute();
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(window.location.reload).toHaveBeenCalledOnce();
  });

  it('clears recovery after the failed route loads successfully', async () => {
    const first = await failedRoute();
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce());
    first.unmount();
    vi.resetModules();
    const { lazyRouteModule } = await import('./routeModule');
    const Route = lazyRouteModule(async () => ({ default: () => <h1>Recovered route</h1> }));
    const recovered = render(
      <Suspense fallback={null}>
        <Route />
      </Suspense>,
    );
    await screen.findByRole('heading', { name: 'Recovered route' });
    recovered.unmount();
    await failedRoute();
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(2));
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

  it('falls through safely when session storage is unavailable', async () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    await failedRoute();
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
