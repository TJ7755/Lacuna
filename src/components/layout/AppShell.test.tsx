import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    onToggleCollapsed,
    toggleLabel = 'Toggle navigation',
  }: {
    onToggleCollapsed: () => void;
    toggleLabel?: string;
  }) => (
    <aside>
      <button type="button" data-sidebar-close onClick={onToggleCollapsed} aria-label={toggleLabel}>
        {toggleLabel}
      </button>
    </aside>
  ),
}));

vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../search/CommandPalette', () => ({
  CommandPalette: () => null,
}));
vi.mock('../ui/KeyHints', () => ({ KeyHints: () => null }));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

function RouteContent() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/settings')}>
      Navigate page
    </button>
  );
}

function renderShell() {
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<RouteContent />} />
          <Route path="settings" element={<h1>Settings</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
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

describe('AppShell mobile navigation', () => {
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
});
