import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const mediaQueryState = vi.hoisted(() => ({
  mobileViewport: true,
  motionMultiplier: 0,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    onToggleCollapsed,
    toggleLabel = 'Toggle navigation',
    collapsed,
  }: {
    onToggleCollapsed: () => void;
    toggleLabel?: string;
    collapsed: boolean;
  }) => (
    <aside data-collapsed={collapsed || undefined}>
      <button type="button" data-sidebar-close onClick={onToggleCollapsed} aria-label={toggleLabel}>
        {toggleLabel}
      </button>
      <a href="#/search">Search content</a>
    </aside>
  ),
}));

vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('../course/FinalExamLifecycleController', () => ({
  FinalExamLifecycleController: () => null,
}));
vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../state/useSearchData', () => ({
  useSearchData: () => ({ cards: [], courses: [], lessons: [], notes: [], questions: [] }),
}));
vi.mock('../ui/KeyHints', () => ({
  KeyHints: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Keyboard shortcuts" /> : null,
}));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => mediaQueryState.motionMultiplier,
}));
function RouteContent() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/settings')}>
        Navigate page
      </button>
      <input aria-label="Page input" />
    </>
  );
}

function renderShell() {
  return render(shellElement());
}

function shellElement() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<RouteContent />} />
          <Route path="settings" element={<h1>Settings</h1>} />
          <Route path="help" element={<h1>Help</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.removeItem('lacuna-shortcut-bindings');
  mediaQueryState.mobileViewport = true;
  mediaQueryState.motionMultiplier = 0;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches:
      query === '(prefers-reduced-motion: reduce)' ||
      (query === '(max-width: 767px)' && mediaQueryState.mobileViewport),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('AppShell native commands', () => {
  function installMenu() {
    let run: (command: 'help' | 'settings' | 'shortcuts') => void = () => {
      throw new Error('Menu listener was not installed');
    };
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        platform: 'darwin',
        onMenuCommand: (callback: typeof run) => {
          run = callback;
          return vi.fn();
        },
      },
    });
    return (command: 'help' | 'settings' | 'shortcuts') => run(command);
  }

  it('opens Lacuna Help when the Electron menu requests it', async () => {
    const run = installMenu();
    renderShell();
    act(() => run('help'));
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeInTheDocument();
  });

  it('opens the keyboard shortcuts panel from the Electron Help menu', async () => {
    const run = installMenu();
    renderShell();
    act(() => run('shortcuts'));
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });
});

describe('AppShell mobile navigation', () => {
  function swipe(target: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
    fireEvent.pointerDown(target, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: from.x,
      clientY: from.y,
    });
    fireEvent.pointerMove(target, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: to.x,
      clientY: to.y,
    });
    fireEvent.pointerUp(target, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: to.x,
      clientY: to.y,
    });
  }

  it('offers keyboard users a first stop that skips the sidebar to the page', () => {
    renderShell();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    const firstFocusable = document.querySelector<HTMLElement>('a[href], button, [tabindex="0"]');
    expect(firstFocusable).toBe(skip);
    fireEvent.click(skip);
    const main = screen.getByRole('main');
    expect(main).toHaveFocus();
  });

  it('opens the drawer after a deliberate right swipe from the left viewport edge', () => {
    renderShell();

    swipe(document.querySelector('main')!, { x: 12, y: 160 }, { x: 84, y: 166 });

    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
  });

  it.each([
    ['starts away from the edge', 'main', { x: 48, y: 160 }, { x: 124, y: 162 }],
    ['is predominantly vertical', 'main', { x: 12, y: 120 }, { x: 30, y: 205 }],
    ['is directionally ambiguous', 'main', { x: 12, y: 120 }, { x: 32, y: 138 }],
    ['starts on an input', 'input', { x: 10, y: 120 }, { x: 90, y: 122 }],
  ])('does not open the drawer when a swipe %s', (_label, targetName, from, to) => {
    renderShell();
    const target =
      targetName === 'input'
        ? screen.getByRole('textbox', { name: 'Page input' })
        : document.querySelector('main')!;

    swipe(target, from, to);

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  });

  it('does not enable the edge gesture at the desktop breakpoint', () => {
    mediaQueryState.mobileViewport = false;
    renderShell();

    swipe(document.querySelector('main')!, { x: 12, y: 160 }, { x: 84, y: 162 });

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  });

  it.each([
    ['the close button', (dialog: HTMLElement) => dialog.querySelector('[data-mobile-close]')],
    ['the sidebar toggle', (dialog: HTMLElement) => dialog.querySelector('[data-sidebar-close]')],
  ])('returns focus to the trigger after %s closes the drawer', (_label, findClose) => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    const close = findClose(dialog);
    expect(close).not.toBeNull();
    fireEvent.click(close!);

    expect(trigger).toHaveFocus();
  });

  it('returns focus to the trigger when Escape closes the drawer', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Navigation' }), { key: 'Escape' });

    expect(trigger).toHaveFocus();
  });

  it('returns focus to the trigger when navigation closes the drawer', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Navigate page').closest('button')!);

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('returns focus to the navigation trigger after Quick search closes from the drawer', async () => {
    renderShell();
    const navigationTrigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(navigationTrigger);

    const navigation = screen.getByRole('dialog', { name: 'Navigation' });
    const quickSearch = within(navigation).getByRole('link', { name: 'Search content' });
    quickSearch.focus();
    fireEvent.keyDown(quickSearch, { key: 'k', ctrlKey: true });

    const searchInput = await screen.findByRole('combobox');
    await waitFor(() => expect(searchInput).toHaveFocus());
    expect(navigation).not.toBeInTheDocument();
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    await waitFor(() => expect(navigationTrigger).toHaveFocus());
  });

  it('does not leave the previous page stacked under the next one', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Navigate page' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Navigate page' })).not.toBeInTheDocument();
  });

  it('does not persist the outgoing page scroll during ordinary navigation', async () => {
    renderShell();
    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    main!.scrollTop = 420;

    fireEvent.click(screen.getByRole('button', { name: 'Navigate page' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible());
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

it('reads the current help binding after the shell has mounted', async () => {
  renderShell();
  localStorage.setItem('lacuna-shortcut-bindings', JSON.stringify({ help: 'b' }));
  fireEvent.keyDown(window, { key: 'b' });
  expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
});

it('does not reopen help when the overlay consumes its closing key', async () => {
  renderShell();
  const event = new KeyboardEvent('keydown', { key: '?', cancelable: true });
  event.preventDefault();
  await act(async () => {
    fireEvent(window, event);
  });
  expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
});
