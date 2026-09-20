import { fireEvent, render, screen } from '@testing-library/react';
import { Suspense, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
