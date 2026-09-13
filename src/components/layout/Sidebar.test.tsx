import { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { Course } from '../../db/types';

let mockCourses: Course[] = [];

vi.mock('../../state/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('../../state/useCourseData', () => ({
  useSidebarData: () => ({ courses: mockCourses, lessons: [], summaries: {}, stats: { streak: 0 } }),
}));

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
  localStorage.removeItem('lacuna.sidebarSettings');
});

describe('Sidebar', () => {
  it('shows the brand without a tagline', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Lacuna')).toBeInTheDocument();
    expect(screen.queryByText(/spaced revision|spaced repetition/i)).not.toBeInTheDocument();

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName).toBe('IMG');
    expect(mark).toHaveAttribute('src', '/icon.svg');
    expect(mark).toHaveClass('h-11', 'w-11', 'p-[3px]', 'bg-[#0a0a0b]');
    expect(screen.getByText('Lacuna')).toHaveClass('text-[28px]');
  });

  it('keeps the enlarged fixed-colour mark inside the collapsed sidebar', () => {
    render(<Sidebar collapsed onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName).toBe('IMG');
    expect(mark).toHaveAttribute('src', '/icon.svg');
    expect(mark).toHaveClass('h-11', 'w-11');
    expect(mark.parentElement).toHaveClass('px-0', 'justify-center');
    expect(mark.parentElement).not.toHaveClass('px-5');
    expect(screen.getByRole('complementary')).toHaveClass(
      'w-[calc(72px+env(safe-area-inset-left))]',
    );
  });

  it('uses a compact 40px brand mark in compact mode', () => {
    localStorage.setItem(
      'lacuna.sidebarSettings',
      JSON.stringify({ showDueCounts: true, compactMode: true }),
    );

    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName).toBe('IMG');
    expect(mark).toHaveAttribute('src', '/icon.svg');
    expect(mark).toHaveClass('h-10', 'w-10');
    expect(screen.getByText('Lacuna')).toHaveClass('text-2xl');
  });

  it('keeps the archive destination fixed in the Courses group and archived courses out of the list', () => {
    mockCourses = [
      { id: 'active', name: 'Active course', archived: false } as Course,
      { id: 'archived', name: 'Finished course', archived: true } as Course,
    ];
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const primary = screen.getByRole('navigation', { name: 'Primary navigation' });
    const courseNavigation = screen.getByRole('navigation', { name: 'Courses' });

    expect(within(primary).queryByRole('link', { name: 'Archived' })).not.toBeInTheDocument();
    expect(within(courseNavigation).getByRole('link', { name: 'Archived' })).toHaveAttribute(
      'href',
      '/archived',
    );
    expect(within(courseNavigation).getByText('Active course')).toBeInTheDocument();
    expect(within(courseNavigation).queryByText('Finished course')).not.toBeInTheDocument();
    mockCourses = [];
  });
  it('fills its shell container without extending beneath the Electron titlebar', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('complementary')).toHaveClass('h-full');
    expect(screen.getByRole('complementary')).not.toHaveClass('h-screen');
  });

  it('exposes cross-course review as Review today', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Review today' })).toHaveAttribute('href', '/learn');
  });

  it('shows the macOS quick-search shortcut exposed by the trusted Electron bridge', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { platform: 'darwin', isElectron: true },
    });
    const onOpenPalette = vi.fn();
    render(
      <Sidebar collapsed={false} onToggleCollapsed={vi.fn()} onOpenPalette={onOpenPalette} />,
      { wrapper: MemoryRouter },
    );

    const search = screen.getByRole('button', { name: /quick search/i });
    expect(search).toHaveTextContent('⌘K');

    fireEvent.click(search);
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it('falls back to a distinctly labelled content-search link without a palette handler', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const search = screen.getByRole('link', { name: 'Search content' });
    expect(search).toHaveAttribute('href', '/search');
  });

  it('exposes the inactive AI action as an unpressed toggle', () => {
    render(
      <Sidebar
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        aiAction={{ active: false, onClick: vi.fn(), triggerRef: createRef() }}
      />,
      { wrapper: MemoryRouter },
    );

    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'false');
  });
});
