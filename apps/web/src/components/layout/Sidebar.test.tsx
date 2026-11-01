import { expectAppDestination } from '../../../../../tests/helpers/expectAppDestination';
import { type ComponentProps } from 'react';
import type * as MotionReact from 'motion/react';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { Course } from '../../db/types';
import { createEnrolmentSetting, enrolInClass } from '../../insights/enrolment';

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
  for (const id of ['joined', 'archived', 'deleted', 'mismatch']) {
    localStorage.removeItem(`lacuna.insights.enrolment.${id}`);
    localStorage.removeItem(`lacuna.insights.optIn.${id}`);
  }
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
  it('offers Import only in the phone drawer, where Today hides its button', () => {
    const { rerender } = render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.queryByRole('link', { name: 'Import' })).not.toBeInTheDocument();
    rerender(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} drawer />);
    expectAppDestination(screen.getByRole('link', { name: 'Import' }), '/import');
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
});

it.each([false, true])(
  'shows joined classes immediately, including collapsed navigation (%s)',
  async (collapsed) => {
    mockCourses = [
      { id: 'joined', name: 'Class biology', distributedCopy: { lineageId: 'biology' } } as Course,
    ];
    const view = render(<Sidebar collapsed={collapsed} onToggleCollapsed={vi.fn()} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.queryByRole('navigation', { name: 'Gaps' })).not.toBeInTheDocument();
    act(() =>
      enrolInClass('joined', {
        shareId: 'a'.repeat(32),
        lineageId: 'biology',
        recipient: { keyId: 'b'.repeat(64), publicKey: 'public' },
      }),
    );
    const section = await screen.findByRole('navigation', { name: 'Gaps' });
    expectAppDestination(
      within(section).getByRole('link', { name: 'Class biology' }),
      '/gaps/joined',
    );
    expect(createEnrolmentSetting('joined').read()?.consentedAt).toBeNull();
    view.unmount();
    render(<Sidebar collapsed={collapsed} onToggleCollapsed={vi.fn()} drawer />, {
      wrapper: MemoryRouter,
    });
    expect(
      within(await screen.findByRole('navigation', { name: 'Gaps' })).getByRole('link', {
        name: 'Class biology',
      }),
    ).toBeInTheDocument();
  },
);
it('hides archived, deleted and mismatched courses and responds to enrolment removal', async () => {
  for (const id of ['joined', 'archived', 'deleted', 'mismatch']) {
    enrolInClass(id, {
      shareId: 'a'.repeat(32),
      lineageId: 'biology',
      recipient: { keyId: 'b'.repeat(64), publicKey: 'public' },
    });
  }
  mockCourses = [
    { id: 'joined', name: 'Class biology', distributedCopy: { lineageId: 'biology' } },
    {
      id: 'archived',
      name: 'Archived class',
      archived: true,
      distributedCopy: { lineageId: 'biology' },
    },
    { id: 'mismatch', name: 'Other course', distributedCopy: { lineageId: 'other' } },
  ] as Course[];
  render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
  const section = await screen.findByRole('navigation', { name: 'Gaps' });
  expect(within(section).getAllByRole('link')).toHaveLength(1);
  act(() => createEnrolmentSetting('joined').write(null));
  await waitFor(() =>
    expect(screen.queryByRole('navigation', { name: 'Gaps' })).not.toBeInTheDocument(),
  );
});

it('recognises an existing stored enrolment without changing its format', async () => {
  localStorage.setItem(
    'lacuna.insights.enrolment.joined',
    JSON.stringify({
      v: 1,
      shareId: 'a'.repeat(32),
      lineageId: 'biology',
      recipient: { keyId: 'b'.repeat(64), publicKey: 'public' },
      pupilId: 'c'.repeat(32),
      pupilLabel: '',
      consentedAt: null,
    }),
  );
  mockCourses = [
    { id: 'joined', name: 'Class biology', distributedCopy: { lineageId: 'biology' } } as Course,
  ];
  render(<Sidebar collapsed={false} onToggleCollapsed={vi.fn()} />, { wrapper: MemoryRouter });
  expect(
    within(await screen.findByRole('navigation', { name: 'Gaps' })).getByRole('link', {
      name: 'Class biology',
    }),
  ).toBeVisible();
});
