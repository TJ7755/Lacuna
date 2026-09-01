import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { Course } from '../../db/types';

let mockCourses: Course[] = [];

vi.mock('../../state/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('../../state/useCourseData', () => ({
  useSidebarData: () => ({ courses: mockCourses, lessons: [], summaries: {}, stats: { streak: 0 } }),
}));

describe('Sidebar', () => {
  it('provides a dedicated archive destination and never mixes archived courses into the list', () => {
    mockCourses = [
      { id: 'active', name: 'Active course', archived: false } as Course,
      { id: 'archived', name: 'Finished course', archived: true } as Course,
    ];
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Archived' })).toHaveAttribute('href', '/archived');
    expect(screen.getByText('Active course')).toBeInTheDocument();
    expect(screen.queryByText('Finished course')).not.toBeInTheDocument();
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

  it('opens quick search from a distinctly labelled control showing the shortcut', () => {
    const onOpenPalette = vi.fn();
    render(
      <Sidebar collapsed={false} onToggleCollapsed={vi.fn()} onOpenPalette={onOpenPalette} />,
      { wrapper: MemoryRouter },
    );

    const search = screen.getByRole('button', { name: /quick search/i });
    expect(search).toHaveTextContent('Ctrl/Cmd+K');

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
