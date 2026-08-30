import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const mediaQueryState = vi.hoisted(() => ({ aiDesktop: true }));

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    onToggleCollapsed,
    toggleLabel = 'Toggle navigation',
    collapsed,
    aiAction,
    onOpenPalette,
  }: {
    onToggleCollapsed: () => void;
    toggleLabel?: string;
    collapsed: boolean;
    aiAction?: { onClick: () => void; triggerRef: React.RefObject<HTMLButtonElement> };
    onOpenPalette?: () => void;
  }) => (
    <aside data-collapsed={collapsed || undefined}>
      <button type="button" data-sidebar-close onClick={onToggleCollapsed} aria-label={toggleLabel}>
        {toggleLabel}
      </button>
      {aiAction && (
        <button ref={aiAction.triggerRef} type="button" onClick={aiAction.onClick}>
          AI
        </button>
      )}
      {onOpenPalette && (
        <button type="button" onClick={onOpenPalette}>
          Quick search
        </button>
      )}
    </aside>
  ),
}));

vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../state/useSearchData', () => ({
  useSearchData: () => ({ cards: [], courses: [], lessons: [], notes: [], questions: [] }),
}));
vi.mock('../ui/KeyHints', () => ({ KeyHints: () => null }));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));
vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => mediaQueryState.aiDesktop,
}));
vi.mock('../../ai/settings', () => ({
  useAiSettings: () => [{ enabled: true, misconceptionFirstEnabled: true }, vi.fn()],
}));
vi.mock('../../ai/session/AiSessionContext', () => ({
  useOptionalAiSession: () => ({}),
}));
vi.mock('../ai/AiPanel', () => ({
  AiPanel: ({ onClose }: { onClose: () => void }) => (
    <aside aria-label="AI conversation">
      <button type="button" onClick={onClose}>Close AI</button>
    </aside>
  ),
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
  mediaQueryState.aiDesktop = true;
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

  it('returns focus to the navigation trigger after Quick search closes from the drawer', async () => {
    renderShell();
    const navigationTrigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(navigationTrigger);

    const navigation = screen.getByRole('dialog', { name: 'Navigation' });
    const quickSearch = within(navigation).getByRole('button', { name: 'Quick search' });
    quickSearch.focus();
    fireEvent.click(quickSearch);

    const searchInput = await screen.findByRole('combobox');
    await waitFor(() => expect(searchInput).toHaveFocus());
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
});

describe('AppShell AI workspace', () => {
  it('opens beside a forced navigation rail and restores focus when closed', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(min-width: 1024px)' || query === '(min-width: 1280px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderShell();

    const trigger = screen.getByRole('button', { name: 'AI' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByLabelText('AI conversation')).toBeInTheDocument();
    expect(trigger.closest('aside')).toHaveAttribute('data-collapsed', 'true');

    const close = screen.getByRole('button', { name: 'Close AI' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByLabelText('AI conversation')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not mount the AI control below the desktop breakpoint', () => {
    mediaQueryState.aiDesktop = false;
    renderShell();
    expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
  });

  it('closes the AI workspace when the shared desktop breakpoint stops matching', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(min-width: 1024px)' || query === '(min-width: 1280px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(screen.getByLabelText('AI conversation')).toBeInTheDocument();

    mediaQueryState.aiDesktop = false;
    fireEvent.click(screen.getByRole('button', { name: 'Navigate page' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI conversation')).not.toBeInTheDocument();
    });
  });
});
