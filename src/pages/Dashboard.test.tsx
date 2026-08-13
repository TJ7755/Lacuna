import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { Course, Card } from '../db/types';

const mockNavigate = vi.fn();
const { mockUpdateCourse, mockNotify } = vi.hoisted(() => ({
  mockUpdateCourse: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('../db/repository', () => ({ updateCourse: mockUpdateCourse }));
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

vi.mock('../components/ui/icons', () => ({
  ChevronRightIcon: () => <svg data-testid="chevron-right-icon" />,
  LacunaIcon: () => <svg data-testid="lacuna-icon" />,
  PlayIcon: () => <svg data-testid="play-icon" />,
  PlusIcon: () => <svg data-testid="plus-icon" />,
}));

let mockActiveFlow: { courseId: string } | null = null;

vi.mock('../state/activeStudyFlow', () => ({
  readActiveStudyFlow: () => mockActiveFlow,
}));

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

vi.mock('../components/dashboard/StudySignals', () => ({
  StudySignals: () => <div data-testid="study-signals">Study Signals</div>,
}));

// The dashboard renders inside the app shell, which provides the study sheet. These tests
// render the page alone, so the hook is mocked rather than wrapping every render.
const { mockOpenStudySheet } = vi.hoisted(() => ({ mockOpenStudySheet: vi.fn() }));

vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: mockOpenStudySheet }),
}));

vi.mock('../components/dashboard/ReviewHeatmap', () => ({
  ReviewHeatmap: () => <div data-testid="review-heatmap">Review Heatmap</div>,
}));

vi.mock('../components/course/CourseCard', () => ({
  CourseCard: ({
    course,
    onClick,
    onStudy,
    onArchiveMenu,
  }: {
    course: Course;
    onClick: () => void;
    onStudy: () => void;
    onArchiveMenu?: (position: { x: number; y: number }, trigger: HTMLButtonElement) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={(event) => {
          event.preventDefault();
          onArchiveMenu?.({ x: event.clientX, y: event.clientY }, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            onArchiveMenu?.({ x: 10, y: 10 }, event.currentTarget);
          }
        }}
        data-testid="course-card"
      >
        {course.name}
      </button>
      <button type="button" onClick={onStudy} data-testid={`study-${course.id}`}>
        Study
      </button>
    </div>
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

const mockCard: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  schedulingUnitId: 'deck-1',
  type: 'front_back',
  front: 'Front',
  back: 'Back',
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [],
  createdAt: Date.now(),
  updatedAt: 1,
  tags: [],
  suspended: false,
  buriedUntil: null,
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockUpdateCourse.mockReset();
  mockUpdateCourse.mockResolvedValue(undefined);
  mockNotify.mockReset();
  mockCourseDashboardData = undefined;
  mockPendingUpdateIds = new Set<string>();
  mockActiveFlow = null;
});

function setCourseData(courses: Course[] = [mockCourse]) {
  mockCourseDashboardData = {
    courses,
    lessons: [],
    allCards: [],
    summaries: {},
    stats: { reviewedToday: 0, streak: 0, forecast: [] },
  };
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
    mockCourseDashboardData = {
      courses: [],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.getByText('No courses yet')).toBeInTheDocument();
  });

  it('renders course cards when courses exist', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [mockCard],
      summaries: {
        'course-1': { lessonCount: 3, cardCount: 42, mastery: 0.5, unreviewed: 10, eligible: 0 },
      },
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByTestId('course-card')).toBeInTheDocument();
  });

  it('lists archived courses with a persistent Unarchive action', async () => {
    setCourseData([{ ...mockCourse, archived: true }]);
    render(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'Archived courses' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: false }),
    );
  });

  it('navigates to course page when a course card is clicked', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    fireEvent.click(screen.getByTestId('course-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1');
  });

  it('navigates to update review when a course has pending changes', () => {
    setCourseData();
    mockPendingUpdateIds = new Set(['course-1']);

    render(<Dashboard />);
    fireEvent.click(screen.getByTestId('course-card'));

    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/updates');
  });

  it('navigates to the course study flow when the Study action is used', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    fireEvent.click(screen.getByTestId('study-course-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study');
  });

  it('shows a resume banner for an active study flow and navigates on click', () => {
    mockActiveFlow = { courseId: 'course-1' };
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    fireEvent.click(screen.getByText('Resume study flow'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study');
  });

  it('does not show a resume banner when there is no active study flow', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.queryByText('Resume study flow')).not.toBeInTheDocument();
  });

  it('offers the study sheet in the same place when there is no flow to resume', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    fireEvent.click(screen.getByText('Choose a course'));
    expect(mockOpenStudySheet).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('offers no study control until there is a course to study', () => {
    mockCourseDashboardData = {
      courses: [],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.queryByText('Choose a course')).not.toBeInTheDocument();
  });

  it('shows page heading', () => {
    mockCourseDashboardData = {
      courses: [],
      lessons: [],
      allCards: [],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.getByText('Courses')).toBeInTheDocument();
  });

  it('does not show a cross-course review bar even when eligible cards exist', () => {
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [],
      summaries: {
        'course-1': { lessonCount: 2, cardCount: 10, mastery: 0.3, unreviewed: 5, eligible: 7 },
      },
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.queryByText('Review all')).not.toBeInTheDocument();
  });

  it('shows review heatmap when any card has history', () => {
    const cardWithHistory: Card = {
      ...mockCard,
      history: [
        {
          timestamp: Date.now(),
          grade: 3,
          responseTimeSec: 5,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 1,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
      ],
    };
    mockCourseDashboardData = {
      courses: [mockCourse],
      lessons: [],
      allCards: [cardWithHistory],
      summaries: {},
      stats: { reviewedToday: 0, streak: 0, forecast: [] },
    };
    render(<Dashboard />);
    expect(screen.getByTestId('review-heatmap')).toBeInTheDocument();
  });

  it('opens the course menu with a right click without navigating, then dismisses it', () => {
    setCourseData();
    render(<Dashboard />);

    fireEvent.contextMenu(screen.getByTestId('course-card'), { clientX: 120, clientY: 80 });
    expect(screen.getByRole('menu', { name: 'Actions for Test Course' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the course menu from the keyboard and closes it with Escape', () => {
    setCourseData();
    render(<Dashboard />);
    const card = screen.getByTestId('course-card');

    fireEvent.keyDown(card, { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('cancels archiving from the confirmation dialog', () => {
    setCourseData();
    render(<Dashboard />);

    fireEvent.contextMenu(screen.getByTestId('course-card'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.getByRole('dialog', { name: 'Archive Test Course?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('archives a course, allows Undo and excludes archived courses from the grid', async () => {
    setCourseData();
    const { rerender } = render(<Dashboard />);

    fireEvent.contextMenu(screen.getByTestId('course-card'));
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
    expect(screen.queryByTestId('course-card')).not.toBeInTheDocument();

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

    fireEvent.contextMenu(screen.getByTestId('course-card'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive course' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The course could not be archived. Nothing was changed.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
