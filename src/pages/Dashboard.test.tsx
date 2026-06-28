import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { Course, Card } from '../db/types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

let mockCourseDashboardData: unknown = undefined;

vi.mock('../state/useCourseData', () => ({
  useCourseDashboardData: () => mockCourseDashboardData,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../components/ui/icons', () => ({
  FlaskIcon: () => <svg data-testid="flask-icon" />,
  PlayIcon: () => <svg data-testid="play-icon" />,
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('../components/dashboard/StudySignals', () => ({
  StudySignals: () => <div data-testid="study-signals">Study Signals</div>,
}));

vi.mock('../components/dashboard/ReviewHeatmap', () => ({
  ReviewHeatmap: () => <div data-testid="review-heatmap">Review Heatmap</div>,
}));

vi.mock('../components/course/CourseCard', () => ({
  CourseCard: ({
    course,
    onClick,
  }: {
    course: Course;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick} data-testid="course-card">
      {course.name}
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
  tags: [],
  suspended: false,
  buriedUntil: null,
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockCourseDashboardData = undefined;
});

describe('Dashboard', () => {
  it('renders skeleton when data is loading', () => {
    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
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

  it('shows study-all strip when eligible cards exist across courses', () => {
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
    expect(screen.getByText('7 due')).toBeInTheDocument();
    expect(screen.getByText('Study all')).toBeInTheDocument();
  });

  it('shows review heatmap when any card has history', () => {
    const cardWithHistory: Card = { ...mockCard, history: [{ timestamp: Date.now(), grade: 3, responseTimeSec: 5, distracted: false, stabilityBefore: null, stabilityAfter: 1, difficultyBefore: null, difficultyAfter: 5, retrievabilityAtReview: null }] };
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
});
