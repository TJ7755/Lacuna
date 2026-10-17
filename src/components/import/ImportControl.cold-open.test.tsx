import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
function surface() {
  return document.querySelector<HTMLElement>('[data-morph-surface]')!;
}
function visibleBounds() {
  const style = getComputedStyle(surface());
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  if (style.clipPath === 'none') return { left: 0, top: 0, width, height };
  const match = style.clipPath.match(
    /^inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px round /,
  );
  expect(match).not.toBeNull();
  const [top, right, bottom, left] = match!.slice(1).map(Number);
  return { left, top, width: width - left - right, height: height - top - bottom };
}
beforeEach(() => {
  vi.resetModules();
  loading.load.mockReset();
  // Happy DOM has no layout; supply the loaded content's measurement, not the surface geometry.
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('pt-11') ? 240 : 0;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([390, 1024])(
  'keeps the cold reveal at trigger size at %ipx, then reopens warm',
  async (viewportWidth) => {
    vi.stubGlobal('innerWidth', viewportWidth);
    const panelWidth = Math.min(448, viewportWidth - 48);
    const collapsedBounds = { left: panelWidth - 100, top: 0, width: 100, height: 44 };
    const expandedBounds = { left: 0, top: 0, width: panelWidth, height: 240 };
    const request = deferred();
    loading.load.mockReturnValue(request.promise);
    await setup();
    expect(surface()).toHaveStyle({ width: `${panelWidth}px`, height: '44px' });
    expect(visibleBounds()).toEqual(collapsedBounds);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(visibleBounds()).toEqual(collapsedBounds);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Loading/ })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /Loading/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await act(async () => request.resolve({ default: Panel }));
    const panel = screen.getByRole('region', { name: 'Import sources' });
    expect(panel).toBeVisible();
    expect(panel.closest('[inert]')).toBeNull();
    expect(surface()).toHaveStyle({ width: `${panelWidth}px`, height: '240px' });
    expect(visibleBounds()).toEqual(expandedBounds);
    expect(parseFloat(getComputedStyle(surface()).width)).toBeLessThanOrEqual(viewportWidth - 48);
    expect(panel.closest('.pt-11')).toHaveStyle({ width: 'min(448px, calc(100vw - 48px))' });
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-busy');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(visibleBounds()).toEqual(collapsedBounds);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible();
    expect(visibleBounds()).toEqual(expandedBounds);
    expect(screen.queryByRole('button', { name: /Loading/ })).not.toBeInTheDocument();
    expect(loading.load).toHaveBeenCalledOnce();
  },
);

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
  const retry = deferred();
  loading.load.mockReturnValueOnce(request.promise).mockReturnValueOnce(retry.promise);
  await setup('/?import=1');
  const collapsedBounds = visibleBounds();
  await act(async () => request.reject(new Error('Offline')));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load import');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-busy');
  expect(visibleBounds()).toEqual(collapsedBounds);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Loading/ })).toHaveAttribute('aria-busy', 'true');
  expect(visibleBounds()).toEqual(collapsedBounds);
  await act(async () => retry.resolve({ default: Panel }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-busy');
  expect(loading.load).toHaveBeenCalledTimes(2);
});

it('uses a prefetch completed after mount without a pending opening', async () => {
  loading.load.mockResolvedValue({ default: Panel });
  await setup();
  const { loadRouteModule } = await import('../../routes/routeModule');
  await loadRouteModule(loading.load);
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Loading/ })).not.toBeInTheDocument();
  expect(loading.load).toHaveBeenCalledOnce();
});
