import { expectAppDestination } from '../../../tests/helpers/expectAppDestination';
import { createRef, type ComponentProps } from 'react';
import type * as MotionReact from 'motion/react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { Course } from '../../db/types';

let mockCourses: Course[] | undefined = [];
let mockEligible = 0;
let mockStreak = 0;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  const Span = (props: ComponentProps<typeof actual.m.span>) => (
    <actual.m.span {...props} data-layout-id={props.layoutId} />
  );
  return {
    ...actual,
    m: new Proxy(actual.m, {
      get(target, key) {
        if (key !== 'span') return Reflect.get(target, key);
        return Span;
      },
    }),
  };
});

vi.mock('../../state/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('../../state/useCourseData', () => ({
  useSidebarData: () => ({
    courses: mockCourses,
    lessons: [],
    summaries: { active: { eligible: mockEligible, unreviewed: 3 } },
    stats: { streak: mockStreak, reviewedToday: 4 },
  }),
}));

afterEach(() => {
  mockCourses = [];
  mockEligible = 0;
  mockStreak = 0;
  Reflect.deleteProperty(window, 'electronAPI');
  localStorage.removeItem('lacuna.sidebarSettings');
});

describe('Sidebar', () => {
  it('does not claim there are no courses before the query resolves', () => {
    mockCourses = undefined;
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.queryByText('No courses yet.')).not.toBeInTheDocument();
  });
  it.each([false, true])(
    'shares highlights only within their navigation group (collapsed: %s)',
    (collapsed) => {
      mockCourses = [{ id: 'active', name: 'Active course', archived: false } as Course];
      render(<Sidebar collapsed={collapsed} onToggleCollapsed={vi.fn()} drawer />, {
        wrapper: MemoryRouter,
      });
      const highlight = () => document.querySelector('[data-layout-id]');
      const select = (name: string) => fireEvent.click(screen.getByRole('link', { name }));

      const topIdentity = highlight()?.getAttribute('data-layout-id');
      expect(topIdentity).toBeTruthy();
      for (const name of ['Search content', 'Progress', 'Today']) {
        select(name);
        expect(highlight()).toHaveAttribute('data-layout-id', topIdentity);
        expect(document.querySelectorAll('[data-layout-id]')).toHaveLength(1);
      }

      select('Share');
      const bottomIdentity = highlight()?.getAttribute('data-layout-id');
      expect(bottomIdentity).toBeTruthy();
      expect(bottomIdentity).not.toBe(topIdentity);
      for (const name of ['Settings', 'Help', 'Share']) {
        select(name);
        expect(highlight()).toHaveAttribute('data-layout-id', bottomIdentity);
        expect(document.querySelectorAll('[data-layout-id]')).toHaveLength(1);
      }

      for (const origin of ['Today', 'Settings']) {
        for (const destination of ['Active course', 'Archived', 'Import']) {
          select(origin);
          select(destination);
          expect(highlight()).toBeNull();
          expect(screen.getByRole('link', { name: destination })).toHaveAttribute(
            'aria-current',
            'page',
          );
        }
      }
    },
  );

  it.each(['/course/active', '/course/active/cards', '/course/active/lesson/lesson-one'])(
    'selects a nested course directly on initial route %s',
    (pathname) => {
      mockCourses = [{ id: 'active', name: 'Active course', archived: false } as Course];
      render(
        <MemoryRouter initialEntries={[pathname]}>
          <Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />
        </MemoryRouter>,
      );
      expect(document.querySelector('[data-layout-id]')).toBeNull();
      expect(screen.getByRole('link', { name: 'Active course' })).toHaveClass('bg-surface');
    },
  );

  it('uses the Search destination consistently with the other navigation entries', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expectAppDestination(screen.getByRole('link', { name: 'Search content' }), '/search');
    expect(screen.queryByRole('button', { name: /^Search/ })).not.toBeInTheDocument();
  });

  it('keeps review actions on Today rather than repeating them in navigation', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('link', { name: 'Review today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review today' })).not.toBeInTheDocument();
  });
  it('offers Import only in the phone drawer, where Today hides its button', () => {
    const { rerender } = render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.queryByRole('link', { name: 'Import' })).not.toBeInTheDocument();
    rerender(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} drawer />);
    expectAppDestination(screen.getByRole('link', { name: 'Import' }), '/import');
  });
  it('fades the hidden edges of its scrollbar-less course list', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    const archived = screen.getByRole('link', { name: 'Archived' });
    expect(archived.closest('.scroll-edge-fade')).not.toBeNull();
  });

  it('shows the brand without a tagline', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Lacuna')).toBeInTheDocument();
    expect(screen.queryByText(/spaced revision|spaced repetition/i)).not.toBeInTheDocument();

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark).toHaveClass('text-accent-ink');
    expect(mark).not.toHaveAttribute('src');
    expect(mark).toHaveClass('h-9', 'w-9', 'p-[3px]', 'bg-accent-soft');
    expect(screen.getByText('Lacuna')).toHaveClass('text-xl');
  });

  it('keeps the accent-token mark inside the collapsed sidebar', () => {
    render(<Sidebar collapsed onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark).toHaveClass('text-accent-ink');
    expect(mark).not.toHaveAttribute('src');
    expect(mark).toHaveClass('h-9', 'w-9');
    expect(mark.parentElement).toHaveClass('px-[18px]');
    expect(screen.getByText('Lacuna')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Lacuna')).toHaveAttribute('inert');
    expect(mark.parentElement).not.toHaveClass('px-5');
    expect(screen.getByRole('complementary')).toHaveClass(
      'w-[calc(72px+env(safe-area-inset-left))]',
    );
  });

  it('uses a compact 32px brand mark in compact mode', () => {
    localStorage.setItem(
      'lacuna.sidebarSettings',
      JSON.stringify({ showDueCounts: true, compactMode: true }),
    );

    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const mark = screen.getByTestId('sidebar-brand-mark');
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark).toHaveClass('text-accent-ink');
    expect(mark).not.toHaveAttribute('src');
    expect(mark).toHaveClass('h-8', 'w-8');
    expect(screen.getByText('Lacuna')).toHaveClass('text-lg');
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
    expectAppDestination(
      within(courseNavigation).getByRole('link', { name: 'Archived' }),
      '/archived',
    );
    expect(within(courseNavigation).getByText('Active course')).toBeInTheDocument();
    expect(within(courseNavigation).queryByText('Finished course')).not.toBeInTheDocument();
    mockCourses = [];
  });
  it('counts calendar days to an evening exam, not part-days', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 16, 0));
    mockCourses = [
      {
        id: 'active',
        name: 'Active course',
        archived: false,
        examDate: new Date(2026, 9, 15, 23, 59).getTime(),
      } as Course,
    ];
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: /Active course/ })).toHaveTextContent('7');
    expect(screen.getByRole('link', { name: /Active course/ })).not.toHaveTextContent('8');
    vi.useRealTimers();
  });

  it('says no active courses when every course is archived', () => {
    mockCourses = [{ id: 'archived', name: 'Finished course', archived: true } as Course];
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    const message = screen.getByText('No active courses.');
    // The message stands in for the course list, so it sits above Archived.
    expect(
      message.compareDocumentPosition(screen.getByRole('link', { name: /Archived/ })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    mockCourses = [];
  });

  it('keeps ready counts and the streak out of sidebar rows', () => {
    mockCourses = [{ id: 'active', name: 'Active course', archived: false } as Course];
    mockEligible = 7;
    mockStreak = 5;
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: /Active course/ })).not.toHaveTextContent('7');
    expect(screen.getByRole('link', { name: /Today/ })).not.toHaveTextContent('5');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('fills its shell container without extending beneath the Electron titlebar', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('complementary')).toHaveClass('h-full');
    expect(screen.getByRole('complementary')).not.toHaveClass('h-screen');
  });

  it('exposes Today as the destination for cross-course review', () => {
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    expectAppDestination(screen.getByRole('link', { name: 'Today' }), '/');
  });

  it('keeps Search content as a route on macOS too', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { platform: 'darwin', isElectron: true },
    });
    render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });

    const search = screen.getByRole('link', { name: 'Search content' });
    expect(search.querySelector('kbd')).toBeNull();
    expectAppDestination(search, '/search');
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
