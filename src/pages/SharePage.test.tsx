import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  useCourse: (courseId: string | undefined) =>
    mockCourses?.find((course) => course.id === courseId) ?? null,
}));

vi.mock('../db/repository', () => ({
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
  speedMultiplier: () => 1,
}));

let mockDecodedPayload: Record<string, unknown> = {};

vi.mock('../db/share', () => ({
  buildCourseShareCode: vi.fn(() => Promise.resolve('LAC2-test-code')),
  buildCourseShareCodeQR: vi.fn(() => Promise.resolve('LAC2-qr-code')),
  decodeShare: vi.fn(() => Promise.resolve(mockDecodedPayload)),
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

let mockFindCourseForLineage: (() => Promise<Course | undefined>) | undefined;
const mockMergeLineageUpdate = vi.fn();

vi.mock('../db/mergeImport', () => ({
  isLineagePayload: (payload: Record<string, unknown>) =>
    payload.v === 2 && typeof payload.li === 'string' && typeof payload.rv === 'number',
  findCourseForLineage: () =>
    mockFindCourseForLineage ? mockFindCourseForLineage() : Promise.resolve(undefined),
  mergeLineageUpdate: (...args: unknown[]) => mockMergeLineageUpdate(...args),
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
};

beforeEach(() => {
  mockNotify.mockClear();
  mockCourses = undefined;
  mockSummaries = undefined;
  mockCourseCards = [];
  mockDecodedPayload = {};
  mockFindCourseForLineage = undefined;
  mockMergeLineageUpdate.mockReset();
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
    expect(screen.getByPlaceholderText('Paste a Lacuna share code here (it starts with LAC)...')).toBeInTheDocument();
  });

  it('shows the never-published publish state for a course with no distribution', () => {
    mockCourses = [mockCourse];
    mockSummaries = { [mockCourse.id]: mockSummary };
    render(<SharePage />);
    fireEvent.click(screen.getByText('Test Course'));
    expect(
      screen.getByText('Publishing lets students receive updates when you share a new code.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publish course')).toBeInTheDocument();
    expect(screen.queryByText(/Revision/)).not.toBeInTheDocument();
  });

  it('shows the published state with revision and relative date for a published course', () => {
    const published: Course = {
      ...mockCourse,
      distribution: { lineageId: 'lineage-1', revision: 3, publishedAt: Date.now() - 60_000 },
    };
    mockCourses = [published];
    mockSummaries = { [published.id]: mockSummary };
    render(<SharePage />);
    fireEvent.click(screen.getByText('Test Course'));
    expect(screen.getByText(/Revision 3 · published/)).toBeInTheDocument();
    expect(screen.getByText('Publish update')).toBeInTheDocument();
  });

  describe('decode-time merge routing (Arc 7 §7.5)', () => {
    async function inspectCode() {
      render(<SharePage />);
      fireEvent.change(
        screen.getByPlaceholderText('Paste a Lacuna share code here (it starts with LAC)...'),
        { target: { value: 'LAC2-some-code' } },
      );
      fireEvent.click(screen.getByText('Read code'));
      await screen.findByRole('heading', { level: 3 });
    }

    it('a plain (non-distributed) import is unaffected', async () => {
      mockDecodedPayload = { v: 2 };
      await inspectCode();
      expect(screen.getByText('Ready to import')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Add to my courses'));
      await waitFor(() => expect(mockNotify).toHaveBeenCalled());
      expect(mockMergeLineageUpdate).not.toHaveBeenCalled();
    });

    it('routes to the merge importer when the payload lineage matches a local course', async () => {
      mockDecodedPayload = { v: 2, li: 'lineage-1', rv: 2 };
      const distributedCourse: Course = {
        ...mockCourse,
        id: 'course-2',
        name: 'My Copy',
        distributedCopy: {
          lineageId: 'lineage-1',
          revision: 1,
          locked: true,
          autoAcceptUpdates: false,
        },
      };
      mockFindCourseForLineage = () => Promise.resolve(distributedCourse);
      mockMergeLineageUpdate.mockResolvedValue({
        createdLessons: 1,
        createdNotes: 0,
        createdCards: 2,
        appliedUpdates: 0,
        appliedRemovals: 0,
        queuedForReview: false,
        conflictCount: 0,
      });

      await inspectCode();
      expect(screen.getByText('Course update')).toBeInTheDocument();
      expect(screen.getByText('My Copy')).toBeInTheDocument();
      expect(screen.getByText(/revision 1 → 2/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Update course'));
      await waitFor(() => expect(mockMergeLineageUpdate).toHaveBeenCalled());
      expect(mockMergeLineageUpdate).toHaveBeenCalledWith('course-2', mockDecodedPayload);
      await waitFor(() =>
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('Updated the course'), 'positive'),
      );
    });

    it('reports queued changes from a merge that needs review', async () => {
      mockDecodedPayload = { v: 2, li: 'lineage-1', rv: 2 };
      const distributedCourse: Course = {
        ...mockCourse,
        id: 'course-2',
        name: 'My Copy',
        distributedCopy: {
          lineageId: 'lineage-1',
          revision: 1,
          locked: true,
          autoAcceptUpdates: false,
        },
      };
      mockFindCourseForLineage = () => Promise.resolve(distributedCourse);
      mockMergeLineageUpdate.mockResolvedValue({
        createdLessons: 0,
        createdNotes: 0,
        createdCards: 0,
        appliedUpdates: 0,
        appliedRemovals: 0,
        queuedForReview: true,
        conflictCount: 2,
      });

      await inspectCode();
      fireEvent.click(screen.getByText('Update course'));
      await waitFor(() =>
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining('2 changes are waiting for your review.'),
          'positive',
        ),
      );
    });

    it('guards against re-importing a code whose revision is not newer than the local copy', async () => {
      mockDecodedPayload = { v: 2, li: 'lineage-1', rv: 1 };
      const distributedCourse: Course = {
        ...mockCourse,
        id: 'course-2',
        name: 'My Copy',
        distributedCopy: {
          lineageId: 'lineage-1',
          revision: 1,
          locked: true,
          autoAcceptUpdates: false,
        },
      };
      mockFindCourseForLineage = () => Promise.resolve(distributedCourse);

      await inspectCode();
      expect(
        screen.getByText(/You already have the latest version of/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Update course')).not.toBeInTheDocument();
      expect(screen.getByText('Close')).toBeInTheDocument();
      expect(mockMergeLineageUpdate).not.toHaveBeenCalled();
    });
  });
});
