import { fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter as ReactRouterMemory } from 'react-router-dom';
import { beforeEach, expect, vi } from 'vitest';
import { publishCourse } from '../db/courseRepository';
import { downloadTextFile } from '../db/export';
import { buildCourseShareCode } from '../db/share';
import type { Card, Course } from '@lacuna/core/db/types';
import type { CourseSummary } from '../state/useCourseData';

export const mockNotify = vi.fn();

export function render(ui: ReactNode) {
  return renderUi(ui, { wrapper: ReactRouterMemory });
}

export const sharePageState = {
  mockCourses: undefined as Course[] | undefined,
  mockSummaries: undefined as Record<string, CourseSummary> | undefined,
  mockCourseCards: [] as Card[],
  mockSearchParams: new URLSearchParams(),
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
    }: {
      to: string;
      children: React.ReactNode;
      className?: string;
    }) => (
      <a href={`#${to}`} className={className}>
        {children}
      </a>
    ),
    useSearchParams: () => [sharePageState.mockSearchParams, vi.fn()],
  };
});

vi.mock('../state/useCourseData', () => ({
  useCourses: () => sharePageState.mockCourses,
  useCourseSummaries: () => sharePageState.mockSummaries,
  useCourseCards: () => sharePageState.mockCourseCards,
}));

vi.mock('../db/courseRepository', () => ({
  publishCourse: vi.fn(() =>
    Promise.resolve({ lineageId: 'lineage-1', revision: 1, publishedAt: Date.now() }),
  ),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 0,
}));

vi.mock('../db/share', () => ({
  buildCourseShareCode: vi.fn(() => Promise.resolve('LAC2-test-code')),
  buildCourseShareCodeQR: vi.fn(() => Promise.resolve('LAC2-qr-code')),
}));

export const mockBuildCourseFile = vi.fn();
vi.mock('../db/courseFile', () => ({
  buildCourseFile: (...args: unknown[]) => mockBuildCourseFile(...args),
  decodeCourseFile: vi.fn(),
  MAX_COURSE_FILE_BYTES: 100 * 1024 * 1024,
}));

vi.mock('../db/export', () => ({
  exportCardsSimple: vi.fn(() => 'card front\tcard back'),
  downloadTextFile: vi.fn(),
}));

export const mockPublishShareLink = vi.fn();
export const mockUnpublishShareLink = vi.fn();
vi.mock('../shareLinks/publish', () => {
  class ShareLinkNeedsReplacementError extends Error {
    constructor(message = 'This link was created on another device.') {
      super(message);
      this.name = 'ShareLinkNeedsReplacementError';
    }
  }
  return {
    publishShareLink: (...args: unknown[]) => mockPublishShareLink(...args),
    unpublishShareLink: (...args: unknown[]) => mockUnpublishShareLink(...args),
    ShareLinkNeedsReplacementError,
  };
});

export const mockReadShareCredentials = vi.fn();
vi.mock('../shareLinks/credentials', () => ({
  readShareCredentials: (...args: unknown[]) => mockReadShareCredentials(...args),
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('react-qr-code', () => ({
  default: () => <div data-testid="qr-code">QR Code</div>,
}));

export const mockCourse: Course = {
  id: 'course-1',
  name: 'Test Course',
  description: '',
  createdAt: Date.now(),
  updatedAt: 1,
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
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
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

export const mockSummary: CourseSummary = {
  lessonCount: 1,
  cardCount: 1,
  mastery: 0,
  unreviewed: 1,
  eligible: 1,
  examPracticeEligible: 0,
  completedLessonCount: 0,
  reviewedCardCount: 0,
  reviewedTodayCount: 0,
};

export function linked(
  shareId: string,
  revision: number,
  extra: Record<string, unknown> = {},
): Course {
  return {
    ...mockCourse,
    distribution: {
      lineageId: 'lineage-1',
      revision,
      publishedAt: Date.now() - 60_000,
      shareId,
      ...extra,
    },
  } as Course;
}

export function given(...courses: Course[]) {
  sharePageState.mockCourses = courses;
  sharePageState.mockSummaries = Object.fromEntries(
    courses.map((course) => [course.id, mockSummary]),
  );
}

export function otherWay(name: string) {
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Other ways' })).getByRole('button', { name }),
  );
}

export function chooseCourse(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Course to share' }));
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${name}`) }));
}

beforeEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
  mockNotify.mockClear();
  vi.mocked(downloadTextFile).mockClear();
  vi.mocked(buildCourseShareCode).mockClear();
  vi.mocked(publishCourse).mockClear();
  mockBuildCourseFile.mockReset();
  sharePageState.mockCourses = undefined;
  sharePageState.mockSummaries = undefined;
  sharePageState.mockCourseCards = [];
  sharePageState.mockSearchParams = new URLSearchParams();
  mockPublishShareLink.mockReset();
  mockUnpublishShareLink.mockReset();
  mockReadShareCredentials.mockReset();
  mockReadShareCredentials.mockResolvedValue({
    relayUrl: 'https://relay.example',
    writeToken: 'a'.repeat(64),
  });
});

export async function expectShareLinkRevision(revision: number) {
  await waitFor(() => {
    const heading = screen.getByRole('heading', { name: 'Share link', level: 2 });
    expect(
      within(heading.parentElement!).getByText(new RegExp(`^Revision ${revision}(?: ·|$)`)),
    ).toBeVisible();
  });
}
