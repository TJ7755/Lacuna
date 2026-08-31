import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiSession } from '../../ai/session/types';
import { createInMemoryAiSession } from '../../ai/session/inMemory';
import { AppShell } from './AppShell';

const mediaQueryState = vi.hoisted(() => ({ aiDesktop: true, mobileViewport: true }));
const aiSessionState = vi.hoisted<{ current: AiSession | null }>(() => ({ current: null }));

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
  useOptionalAiSession: () => aiSessionState.current,
}));
vi.mock('../ai/AiPanel', () => ({
  AiPanel: ({ onClose }: { onClose: () => void }) => (
    <aside aria-label="AI conversation">
      <button type="button" onClick={onClose}>
        Close AI
      </button>
    </aside>
  ),
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
  sessionStorage.clear();
  mediaQueryState.aiDesktop = true;
  mediaQueryState.mobileViewport = true;
  aiSessionState.current = createInMemoryAiSession();
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

  it('restores the current page scroll after an application-shell remount', () => {
    const first = renderShell();
    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    main!.scrollTop = 420;

    first.unmount();
    renderShell();

    expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: 420 });
  });

  it('does not persist the outgoing page scroll during ordinary navigation', async () => {
    renderShell();
    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    main!.scrollTop = 420;

    fireEvent.click(screen.getByRole('button', { name: 'Navigate page' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible());
    expect(sessionStorage.getItem('lacuna-shell-scroll-position')).toBeNull();
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('AppShell AI workspace', () => {
  it('shows the activity capsule only while the full conversation is closed', async () => {
    aiSessionState.current = createInMemoryAiSession({
      run: {
        runId: 'run-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10_000,
        status: 'active',
      },
      activity: {
        runId: 'run-1',
        status: 'working',
        summary: 'Checking recall evidence',
        updatedAt: 2,
      },
    });
    renderShell();

    expect(screen.getByRole('region', { name: 'AI activity' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));

    expect(await screen.findByLabelText('AI conversation')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI activity' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close AI' }));
    expect(screen.getByRole('region', { name: 'AI activity' })).toBeInTheDocument();
  });

  it('makes the activity capsule inert while a modal overlay is open', () => {
    aiSessionState.current = createInMemoryAiSession({
      run: {
        runId: 'run-modal',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10_000,
        status: 'active',
      },
      activity: {
        runId: 'run-modal',
        status: 'working',
        summary: 'Checking recall evidence',
        updatedAt: 2,
      },
    });
    renderShell();

    const capsule = screen.getByRole('region', { name: 'AI activity' });
    expect(capsule.parentElement).not.toHaveAttribute('inert');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(capsule.parentElement).toHaveAttribute('inert');
  });

  it('opens beside a forced navigation rail and restores focus when closed', async () => {
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

    expect(await screen.findByLabelText('AI conversation')).toBeInTheDocument();
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

  it('does not expose completed AI activity below the desktop breakpoint', () => {
    mediaQueryState.aiDesktop = false;
    aiSessionState.current = createInMemoryAiSession({
      activity: {
        runId: 'run-complete',
        status: 'completed',
        summary: 'Explanation complete',
        updatedAt: 2,
      },
    });

    renderShell();

    expect(screen.queryByRole('region', { name: 'AI activity' })).not.toBeInTheDocument();
  });

  it('closes the full workspace but retains Stop when an active run crosses the breakpoint', async () => {
    aiSessionState.current = createInMemoryAiSession({
      run: {
        runId: 'run-breakpoint',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10_000,
        status: 'active',
      },
      activity: {
        runId: 'run-breakpoint',
        status: 'working',
        summary: 'Preparing an explanation',
        updatedAt: 2,
      },
    });
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
    expect(await screen.findByLabelText('AI conversation')).toBeInTheDocument();

    mediaQueryState.aiDesktop = false;
    fireEvent.click(screen.getByRole('button', { name: 'Navigate page' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI conversation')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});
