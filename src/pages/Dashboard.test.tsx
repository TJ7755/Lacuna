import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { Course } from '../db/types';

const mockNavigate = vi.fn();
const { mockUpdateCourse, mockNotify } = vi.hoisted(() => ({
  mockUpdateCourse: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('../db/courseRepository', () => ({ updateCourse: mockUpdateCourse }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: mockNotify }) }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

let mockCourseDashboardData: unknown = undefined;
let mockPendingUpdateIds = new Set<string>();

vi.mock('../state/useCourseData', () => ({
  useCourseDashboardData: () => mockCourseDashboardData,
  usePendingUpdateCourseIds: () => mockPendingUpdateIds,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../components/dashboard/SyncStatus', () => ({ SyncStatus: () => null }));

// Forecasts arrive with the shared course data; tests set them after the data.
let mockForecasts: Record<string, unknown> = {};

vi.mock('../components/course/NewCourseForm', () => ({
  NewCourseForm: () => <div data-testid="new-course-form" />,
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

const mockCourse: Course = {
  id: 'course-1',
  name: 'Test Course',
  description: 'A test course',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  updatedAt: 1,
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 30,
  practiceThresholdMinutesNear: 15,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 5,
};

const DAY = 24 * 60 * 60 * 1000;

function course(id: string, name: string, extra: Partial<Course> = {}): Course {
  return { ...mockCourse, id, name, ...extra };
}

function summary(eligible: number) {
  return { lessonCount: 2, cardCount: 10, mastery: 0.3, unreviewed: 5, eligible };
}

function forecast(atEnd: number, hasExam = true) {
  const now = Date.now();
  return {
    start: now,
    end: now + 7 * DAY,
    hasExam,
    target: 0.9,
    current: 0.8,
    ifStopped: 0.5,
    atEnd,
    series: [
      { at: now, recall: 0.8 },
      { at: now + 7 * DAY, recall: atEnd },
    ],
    outlook: [
      { at: now, recall: 0.5 },
      { at: now + 7 * DAY, recall: atEnd },
    ],
  };
}

interface DataOptions {
  summaries?: Record<string, ReturnType<typeof summary>>;
  minutes?: Record<string, number>;
  streak?: number;
  reviewActivity?: Map<string, number[]>;
}

function setCourseData(courses: Course[] = [mockCourse], options: DataOptions = {}) {
  mockCourseDashboardData = {
    courses,
    lessons: [],
    allCards: [],
    summaries: options.summaries ?? {},
    get forecasts() {
      return mockForecasts;
    },
    reviewActivity: options.reviewActivity ?? new Map(),
    stats: {
      reviewedToday: 0,
      streak: options.streak ?? 0,
      forecast: [
        {
          byDeck: Object.entries(options.minutes ?? {}).map(([sourceId, minutes]) => ({
            sourceId,
            minutes,
          })),
        },
      ],
    },
  };
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockUpdateCourse.mockReset();
  mockUpdateCourse.mockResolvedValue(undefined);
  mockNotify.mockReset();
  mockCourseDashboardData = undefined;
  mockPendingUpdateIds = new Set<string>();
  mockForecasts = {};
});

function queueLinks() {
  const queue = screen.getByRole('region', { name: 'Today, most urgent first' });
  return within(queue).getAllByRole('link');
}

describe('Dashboard', () => {
  it('renders skeleton when data is loading', async () => {
    render(<Dashboard />);
    // The placeholder is withheld until loading has lasted long enough to be worth
    // showing, so a load that resolves quickly never flashes one. See DelayedFallback.
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  it('withholds the loading skeleton while a load could still finish instantly', () => {
    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('renders empty state when no courses exist', () => {
    setCourseData([]);
    render(<Dashboard />);
    const emptyHeading = screen.getByRole('heading', { name: 'No courses yet' });
    expect(emptyHeading).toBeInTheDocument();
    expect(emptyHeading.parentElement).toHaveClass('flex', 'flex-col', 'items-center');
    expect(screen.queryByLabelText(/^Today:/)).not.toBeInTheDocument();
  });

  it('does not render archived courses or restoration controls', () => {
    setCourseData([{ ...mockCourse, archived: true }]);
    render(<Dashboard />);

    expect(screen.queryByRole('heading', { name: 'Archived courses' })).not.toBeInTheDocument();
    expect(screen.queryByText('Test Course')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No active courses' })).toBeInTheDocument();
  });

  it('excludes archived courses from the queue and the totals', () => {
    setCourseData([mockCourse, course('course-2', 'Archived Course', { archived: true })], {
      summaries: { 'course-1': summary(4), 'course-2': summary(9) },
      minutes: { 'course-1': 6, 'course-2': 30 },
    });
    render(<Dashboard />);

    expect(screen.queryByText('Archived Course')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Today: 4 cards, about 6 minutes')).toBeInTheDocument();
  });

  it('has a visually hidden Today heading', () => {
    setCourseData();
    render(<Dashboard />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Today' });
    expect(heading).toHaveClass('sr-only');
  });

  it('totals the cards and minutes due across active courses', () => {
    setCourseData([mockCourse, course('course-2', 'Second Course')], {
      summaries: { 'course-1': summary(7), 'course-2': summary(5) },
      minutes: { 'course-1': 10.4, 'course-2': 4 },
    });
    render(<Dashboard />);
    expect(screen.getByLabelText('Today: 12 cards, about 14 minutes')).toBeInTheDocument();
  });

  it('links each row to its course page', () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
    render(<Dashboard />);
    const link = screen.getByRole('link', { name: 'Test Course' });
    expect(link).toHaveAttribute('href', '/course/course-1');
    expect(screen.queryByText('Update ready')).not.toBeInTheDocument();
  });

  it('links to update review and flags the row when a course has pending changes', () => {
    setCourseData();
    mockPendingUpdateIds = new Set(['course-1']);

    render(<Dashboard />);

    const link = screen.getByRole('link', { name: /Test Course/ });
    expect(link).toHaveAttribute('href', '/course/course-1/updates');
    expect(link).toHaveTextContent('Update ready');
  });

  it('starts the course study flow from the Start button', () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Test Course' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study');
  });

  it('shows Done for today and no Start button when nothing is due', () => {
    setCourseData([mockCourse, course('course-2', 'Busy Course')], {
      summaries: { 'course-1': summary(0), 'course-2': summary(2) },
    });
    render(<Dashboard />);

    expect(screen.getAllByText('Done for today')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Start Test Course' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Busy Course' })).toBeInTheDocument();
    // The row stays reachable and keeps its menu.
    expect(screen.getByRole('link', { name: 'Test Course' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More for Test Course' })).toBeInTheDocument();
  });

  it('orders rows most urgent first: nearest exam, then larger workload, no-exam last', () => {
    const now = Date.now();
    setCourseData(
      [
        course('none-small', 'No Exam Small', { examDate: undefined }),
        course('far', 'Far Exam', { examDate: now + 30 * DAY }),
        course('none-big', 'No Exam Big', { examDate: undefined }),
        course('near', 'Near Exam', { examDate: now + 3 * DAY }),
        course('past', 'Past Exam', { examDate: now - DAY }),
      ],
      {
        summaries: {
          'none-small': summary(1),
          far: summary(20),
          'none-big': summary(9),
          near: summary(2),
          past: summary(5),
        },
      },
    );
    render(<Dashboard />);

    // A past exam no longer counts as an exam, so it ranks among the no-exam courses.
    expect(queueLinks().map((link) => link.textContent)).toEqual([
      'Near Exam',
      'Far Exam',
      'No Exam Big',
      'Past Exam',
      'No Exam Small',
    ]);
  });

  it('shows the exam-day forecast with a legend entry per course', () => {
    setCourseData([mockCourse, course('course-2', 'Second Course')], {
      summaries: { 'course-1': summary(3), 'course-2': summary(1) },
    });
    mockForecasts = { 'course-1': forecast(0.93), 'course-2': forecast(0.71) };
    render(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'Exam-day forecast' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Exam-day forecast' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Courses' });
    expect(within(legend).getByRole('button', { name: /Test Course\s*93%/ })).toBeInTheDocument();
    expect(within(legend).getByRole('button', { name: /Second Course\s*71%/ })).toBeInTheDocument();
  });

  it('omits the forecast chart when no course has a forecast to draw', () => {
    setCourseData();
    render(<Dashboard />);
    expect(screen.queryByRole('heading', { name: 'Exam-day forecast' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Course' })).toBeInTheDocument();
  });

  it('shows the week panel with the streak, cards this week and studied days', () => {
    setCourseData([mockCourse], {
      streak: 5,
      reviewActivity: new Map([['card-1', [Date.now(), Date.now() - 1000]]]),
    });
    mockForecasts = { 'course-1': forecast(0.9) };
    render(<Dashboard />);

    expect(screen.getByText('days in a row')).toBeInTheDocument();
    expect(screen.getByText('cards this week')).toBeInTheDocument();
    expect(screen.getByText('studied this week')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Studied on \d of \d days this week/)).toBeInTheDocument();
    const streak = screen.getByText('days in a row').parentElement as HTMLElement;
    expect(streak).toHaveTextContent('5');
    const cards = screen.getByText('cards this week').parentElement as HTMLElement;
    expect(cards).toHaveTextContent('2');
  });

  it('opens the course menu under its More button without navigating, then dismisses it', () => {
    setCourseData();
    render(<Dashboard />);
    const more = screen.getByRole('button', { name: 'More for Test Course' });
    vi.spyOn(more, 'getBoundingClientRect').mockReturnValue({
      right: 500,
      bottom: 100,
      left: 456,
      top: 56,
      width: 44,
      height: 44,
      x: 456,
      y: 56,
      toJSON: () => ({}),
    });

    fireEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'Actions for Test Course' });
    expect(menu).toHaveStyle({ left: '340px', top: '106px' });
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the course menu with Escape and returns focus to the More button', () => {
    setCourseData();
    render(<Dashboard />);
    const more = screen.getByRole('button', { name: 'More for Test Course' });

    fireEvent.click(more);
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('cancels archiving from the confirmation dialog', () => {
    setCourseData();
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.getByRole('dialog', { name: 'Archive Test Course?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('archives a course, allows Undo and drops the archived course from the queue', async () => {
    setCourseData();
    const { rerender } = render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive course' }));

    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: true }),
    );
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith(
        'Test Course archived',
        'positive',
        expect.objectContaining({ actionLabel: 'Undo' }),
      ),
    );

    setCourseData([{ ...mockCourse, archived: true }]);
    rerender(<Dashboard />);
    expect(screen.queryByRole('link', { name: 'Test Course' })).not.toBeInTheDocument();

    const options = mockNotify.mock.calls[0][2] as { onAction: () => void };
    options.onAction();
    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: false }),
    );
  });

  it('keeps the confirmation open and reports an archive failure', async () => {
    mockUpdateCourse.mockRejectedValueOnce(new Error('database unavailable'));
    setCourseData();
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive course' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The course could not be archived. Nothing was changed.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
