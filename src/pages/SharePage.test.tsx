import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SharePage } from './SharePage';
import type { Card, Course } from '../db/types';
import type { CourseSummary } from '../state/useCourseData';

const mockNotify = vi.fn();

let mockCourses: Course[] | undefined = undefined;
let mockSummaries: Record<string, CourseSummary> | undefined = undefined;
let mockCourseCards: Card[] = [];

vi.mock('../state/useCourseData', () => ({
  useCourses: () => mockCourses,
  useCourseSummaries: () => mockSummaries,
  useCourseCards: () => mockCourseCards,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../db/share', () => ({
  buildCourseShareCode: vi.fn(() => Promise.resolve('LAC2-test-code')),
  buildCourseShareCodeQR: vi.fn(() => Promise.resolve('LAC2-qr-code')),
  decodeShare: vi.fn(() => Promise.resolve({})),
  importSharePayload: vi.fn(() => Promise.resolve({ courses: 1, lessons: 1, cards: 2 })),
  summariseShare: vi.fn(() => ({
    kind: 'course' as const,
    deckCount: 1,
    cardCount: 2,
    exportedAt: Date.now(),
    deckNames: ['Test Lesson'],
    omittedImages: false,
    courseName: 'Test Course',
    lessonCount: 1,
  })),
}));

vi.mock('../db/export', () => ({
  exportCardsSimple: vi.fn(() => 'card front\tcard back'),
}));

vi.mock('../components/ui/icons', () => ({
  CheckIcon: () => <svg data-testid="check-icon" />,
  DownloadIcon: () => <svg data-testid="download-icon" />,
  ShareIcon: () => <svg data-testid="share-icon" />,
  UploadIcon: () => <svg data-testid="upload-icon" />,
  CardsIcon: () => <svg data-testid="cards-icon" />,
  FileTextIcon: () => <svg data-testid="file-text-icon" />,
  QrCodeIcon: () => <svg data-testid="qr-code-icon" />,
  CameraIcon: () => <svg data-testid="camera-icon" />,
  CloseIcon: () => <svg data-testid="close-icon" />,
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('react-qr-code', () => ({
  default: () => <div data-testid="qr-code">QR Code</div>,
}));

const mockCourse: Course = {
  id: 'course-1',
  name: 'Test Course',
  description: '',
  createdAt: Date.now(),
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
  examObjective: 'expectedMarks',
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const mockSummary: CourseSummary = {
  lessonCount: 1,
  cardCount: 1,
  mastery: 0,
  unreviewed: 1,
  eligible: 1,
  completedLessonCount: 0,
  reviewedCardCount: 0,
  reviewedTodayCount: 0,
};

beforeEach(() => {
  mockNotify.mockClear();
  mockCourses = undefined;
  mockSummaries = undefined;
  mockCourseCards = [];
});

describe('SharePage', () => {
  it('renders loading skeleton when courses are loading', () => {
    render(<SharePage />);
    expect(screen.getByTestId('download-icon')).toBeInTheDocument();
  });

  it('renders empty state when no courses exist', () => {
    mockCourses = [];
    mockSummaries = {};
    render(<SharePage />);
    expect(screen.getByText('No courses yet')).toBeInTheDocument();
    expect(screen.getByText('Create a course first, then come back here to share it with others.')).toBeInTheDocument();
  });

  it('renders course list when courses exist', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    render(<SharePage />);
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByText('1 lesson · 1 card')).toBeInTheDocument();
  });

  it('selects a course when clicked', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    render(<SharePage />);
    const courseBtn = screen.getByText('Test Course');
    fireEvent.click(courseBtn);
    const generateBtn = screen.getByText('Generate share code');
    expect(generateBtn).not.toBeDisabled();
  });

  it('disables generate button when no course is selected', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    render(<SharePage />);
    const generateBtn = screen.getByText('Generate share code');
    expect(generateBtn).toBeDisabled();
  });

  it('shows an image-placeholder warning when the selected course has images', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    mockCourseCards = [
      {
        front: 'What is shown? lacuna-asset://' + 'a'.repeat(64),
        back: 'Answer',
      } as Card,
    ];
    render(<SharePage />);
    fireEvent.click(screen.getByText('Test Course'));
    expect(
      screen.getByText(/This course contains images\. The share code will replace them/),
    ).toBeInTheDocument();
  });

  it('does not show the image-placeholder warning when the selected course has no images', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    mockCourseCards = [{ front: 'Plain text', back: 'Answer' } as Card];
    render(<SharePage />);
    fireEvent.click(screen.getByText('Test Course'));
    expect(
      screen.queryByText(/This course contains images\. The share code will replace them/),
    ).not.toBeInTheDocument();
  });

  it('shows import section with textarea', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    render(<SharePage />);
    expect(screen.getByText('Import a shared course')).toBeInTheDocument();
    expect(
      screen.getByText(/All Lacuna share-code encodings \(LAC0–LAC3\) are supported/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste a Lacuna share code here (it starts with LAC)...')).toBeInTheDocument();
  });
});
