import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const loading = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../routes/loaders', () => ({ loadImportPanel: loading.load }));
vi.mock('../../routes/prefetch', () => ({ prefetchRoute: vi.fn() }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

function Panel({ onClose }: { onClose?: () => void }) {
  return (
    <section aria-label="Import sources">
      <button onClick={onClose}>Cancel import</button>
    </section>
  );
}
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/elsewhere')}>Navigate away</button>;
}
function deferred() {
  let resolve!: (module: { default: typeof Panel }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ default: typeof Panel }>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function setup(entry = '/') {
  const { ImportControl } = await import('./ImportControl');
  const { LazyMotion, domAnimation } = await import('motion/react');
  return render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter initialEntries={[entry]}>
        <ImportControl />
        <Navigation />
      </MemoryRouter>
    </LazyMotion>,
  );
}
beforeEach(() => {
  vi.resetModules();
  loading.load.mockReset();
});

it('shows pending feedback until content is available, then reopens warm', async () => {
  const request = deferred();
  loading.load.mockReturnValue(request.promise);
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Loading/ })).toHaveAttribute('aria-busy', 'true');
  await act(async () => request.resolve({ default: Panel }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  const panel = document.getElementById(
    screen.getByRole('button', { name: 'Import' }).getAttribute('aria-controls')!,
  );
  expect(panel).toContainElement(screen.getByRole('region', { name: 'Import sources' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
  expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  expect(loading.load).toHaveBeenCalledOnce();
});

it('cancels a cold opening before its request resolves', async () => {
  const request = deferred();
  loading.load.mockReturnValue(request.promise);
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  fireEvent.click(screen.getByRole('button', { name: /Loading/ }));
  await act(async () => request.resolve({ default: Panel }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import' })).toHaveAttribute('aria-expanded', 'false');
});

it('does not open after navigation removes the import query', async () => {
  const request = deferred();
  loading.load.mockReturnValue(request.promise);
  await setup('/?import=1');
  fireEvent.click(screen.getByRole('button', { name: 'Navigate away' }));
  await act(async () => request.resolve({ default: Panel }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('allows a failed linked import to retry', async () => {
  const request = deferred();
  loading.load.mockReturnValueOnce(request.promise).mockResolvedValue({ default: Panel });
  await setup('/?import=1');
  await act(async () => request.reject(new Error('Offline')));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load import');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  expect(loading.load).toHaveBeenCalledTimes(2);
});

it('uses a prefetch completed after mount without a pending opening', async () => {
  loading.load.mockResolvedValue({ default: Panel });
  await setup();
  const { loadRouteModule } = await import('../../routes/routeModule');
  await loadRouteModule(loading.load);
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  expect(screen.queryByRole('button', { name: /Loading/ })).not.toBeInTheDocument();
  expect(loading.load).toHaveBeenCalledOnce();
});
