import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('../../state/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('../../state/useCourseData', () => ({
  useSidebarData: () => ({ courses: [], lessons: [], summaries: {}, stats: { streak: 0 } }),
}));

describe('Sidebar', () => {
  it('exposes cross-course review as Review today', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Review today' })).toHaveAttribute('href', '/learn');
  });

  it('opens the command palette from a visible search control showing the shortcut', () => {
    const onOpenPalette = vi.fn();
    render(
      <Sidebar collapsed={false} onToggleCollapsed={vi.fn()} onOpenPalette={onOpenPalette} />,
      { wrapper: MemoryRouter },
    );

    const search = screen.getByRole('button', { name: /search/i });
    expect(search).toHaveTextContent('Ctrl/Cmd+K');

    fireEvent.click(search);
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain link to the search page when no palette handler is given', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const search = screen.getByRole('link', { name: 'Search' });
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
