import { vi, beforeEach } from 'vitest';
import type * as DashboardForecasts from '../state/dashboardForecasts';
import { screen, within } from '@testing-library/react';
import type { Course } from '../db/types';

export const dashboardState = {
  mockCourseDashboardData: undefined as unknown,
  mockPendingUpdateIds: new Set<string>(),
  // The chart's past line needs graded review history; tests supply one per forecast.
  // Undefined stands for history still loading.
  mockReviewHistory: [] as unknown[] | undefined,
  // Forecasts arrive with the shared course data; tests set them after the data.
  mockForecasts: {} as Record<string, unknown>,
};

export const mockNavigate = vi.fn();
const { mockUpdateCourse, mockNotify } = vi.hoisted(() => ({
  mockUpdateCourse: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('../db/courseRepository', () => ({ updateCourse: mockUpdateCourse }));
export const mockOpenStudySheet = vi.fn();
vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: mockOpenStudySheet }),
}));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: mockNotify }) }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useHref: (to: string) => to,
  useResolvedPath: (to: string) => ({ pathname: to }),
  useLinkClickHandler: (to: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    mockNavigate(to);
  },
  useLocation: () => ({ state: null, search: '' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('../state/useData', () => ({
  useAllReviewHistory: () => dashboardState.mockReviewHistory,
}));
vi.mock('../state/dashboardForecasts', async (importOriginal) => ({
  ...(await importOriginal<typeof DashboardForecasts>()),
  dashboardForecastHistories: (
    _courses: unknown,
    _lessons: unknown,
    _cards: unknown,
    _history: unknown,
    forecasts: Record<string, { ifStopped: number }>,
  ) =>
    Object.fromEntries(
      Object.entries(forecasts).map(([id, value]) => [
        id,
        [
          { at: Date.now() - DAY, recall: value.ifStopped / 2 },
          { at: Date.now(), recall: value.ifStopped },
        ],
      ]),
    ),
}));
vi.mock('../state/useCourseData', () => ({
  useCourseDashboardData: () => dashboardState.mockCourseDashboardData,
  usePendingUpdateCourseIds: () => dashboardState.mockPendingUpdateIds,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
  getMotionMultiplier: () => 1,
}));

vi.mock('../components/dashboard/SyncStatus', () => ({ SyncStatus: () => null }));

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

export const mockCourse: Course = {
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

export const DAY = 24 * 60 * 60 * 1000;

export function course(id: string, name: string, extra: Partial<Course> = {}): Course {
  return { ...mockCourse, id, name, ...extra };
}

export function summary(
  eligible: number,
  extra: { cardCount?: number; reviewedTodayCount?: number; completedLessonCount?: number } = {},
) {
  return {
    lessonCount: 2,
    completedLessonCount: 2,
    cardCount: 10,
    mastery: 0.3,
    unreviewed: 5,
    eligible,
    reviewedTodayCount: 0,
    ...extra,
  };
}

export function forecast(ifStopped: number, hasExam = true) {
  return { end: Date.now() + 7 * DAY, hasExam, target: 0.9, ifStopped };
}

export interface DataOptions {
  summaries?: Record<string, ReturnType<typeof summary>>;
  minutes?: Record<string, number>;
  forecastCardCounts?: Record<string, number>;
  streak?: number;
  reviewActivity?: Map<string, number[]>;
}

export function setCourseData(courses: Course[] = [mockCourse], options: DataOptions = {}) {
  dashboardState.mockCourseDashboardData = {
    courses,
    lessons: [],
    allCards: [],
    summaries: options.summaries ?? {},
    get forecasts() {
      return dashboardState.mockForecasts;
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
            dueCount:
              options.forecastCardCounts?.[sourceId] ??
              options.summaries?.[sourceId]?.eligible ??
              0,
            newCount: 0,
          })),
        },
      ],
    },
  };
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockOpenStudySheet.mockClear();
  mockUpdateCourse.mockReset();
  mockUpdateCourse.mockResolvedValue(undefined);
  mockNotify.mockReset();
  dashboardState.mockCourseDashboardData = undefined;
  dashboardState.mockPendingUpdateIds = new Set<string>();
  dashboardState.mockForecasts = {};
  dashboardState.mockReviewHistory = [];
});

export function queueTitles() {
  const queue = screen.getByRole('region', { name: 'Today, most urgent first' });
  return Array.from(queue.children, (row) => within(row as HTMLElement).getAllByRole('button')[0]);
}

export { mockUpdateCourse, mockNotify };
