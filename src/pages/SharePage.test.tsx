import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { downloadTextFile } from '../db/export';
import type * as ReactRouterDom from 'react-router-dom';
import { defaultShareCourse, SharePage } from './SharePage';
import { ShareLinkNeedsReplacementError } from '../shareLinks/publish';
import { buildCourseShareCode } from '../db/share';
import { publishCourse } from '../db/courseRepository';
import type { Card, Course } from '../db/types';
import type { CourseSummary } from '../state/useCourseData';

const mockNotify = vi.fn();

let mockCourses: Course[] | undefined = undefined;
let mockSummaries: Record<string, CourseSummary> | undefined = undefined;
let mockCourseCards: Card[] = [];
let mockSearchParams = new URLSearchParams();

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
    useSearchParams: () => [mockSearchParams, vi.fn()],
  };
});

vi.mock('../state/useCourseData', () => ({
  useCourses: () => mockCourses,
  useCourseSummaries: () => mockSummaries,
  useCourseCards: () => mockCourseCards,
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

const mockBuildCourseFile = vi.fn();
vi.mock('../db/courseFile', () => ({
  buildCourseFile: (...args: unknown[]) => mockBuildCourseFile(...args),
  decodeCourseFile: vi.fn(),
  MAX_COURSE_FILE_BYTES: 100 * 1024 * 1024,
}));

vi.mock('../db/export', () => ({
  exportCardsSimple: vi.fn(() => 'card front\tcard back'),
  downloadTextFile: vi.fn(),
}));

const mockPublishShareLink = vi.fn();
const mockUnpublishShareLink = vi.fn();
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

const mockReadShareCredentials = vi.fn();
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

const mockCourse: Course = {
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

function linked(shareId: string, revision: number, extra: Record<string, unknown> = {}): Course {
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

function given(...courses: Course[]) {
  mockCourses = courses;
  mockSummaries = Object.fromEntries(courses.map((course) => [course.id, mockSummary]));
}

function otherWay(name: string) {
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Other ways' })).getByRole('button', { name }),
  );
}

function chooseCourse(name: string) {
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
  mockCourses = undefined;
  mockSummaries = undefined;
  mockCourseCards = [];
  mockSearchParams = new URLSearchParams();
  mockPublishShareLink.mockReset();
  mockUnpublishShareLink.mockReset();
  mockReadShareCredentials.mockReset();
  mockReadShareCredentials.mockResolvedValue({
    relayUrl: 'https://relay.example',
    writeToken: 'a'.repeat(64),
  });
});

describe('defaultShareCourse', () => {
  const archived = { ...mockCourse, id: 'archived', archived: true };
  const active = { ...mockCourse, id: 'active' };
  const shared = linked('a'.repeat(32), 1);

  it('prefers the requested course, then one already shared, then the first active one', () => {
    expect(defaultShareCourse([archived, active, shared], 'active')?.id).toBe('active');
    expect(defaultShareCourse([archived, active, shared], null)?.id).toBe(shared.id);
    expect(defaultShareCourse([archived, active], 'missing')?.id).toBe('active');
    expect(defaultShareCourse([archived], null)?.id).toBe('archived');
    expect(defaultShareCourse([], null)).toBeUndefined();
  });
});

describe('SharePage', () => {
  it('creates links after StrictMode replays the mount effect', async () => {
    given(mockCourse);
    mockPublishShareLink.mockResolvedValue({ shareId: 'a'.repeat(32), revision: 1 });
    render(<StrictMode><SharePage /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toBeInTheDocument();
  });

  it('generates share codes after StrictMode replays the mount effect', async () => {
    given(mockCourse);
    render(<StrictMode><SharePage /></StrictMode>);
    otherWay('Share code');
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    expect(await screen.findByRole('textbox', { name: 'Generated share code' })).toHaveValue('LAC2-test-code');
  });
  it('opens on a course with the share link as the one primary action', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Share link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeEnabled();
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    // One course needs no picker, and the alternatives stay folded away.
    expect(screen.queryByRole('button', { name: 'Course to share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create share code' })).not.toBeInTheDocument();
  });

  it('leaves receiving to the Import page', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.queryByText('Import a shared course')).not.toBeInTheDocument();
  });

  it('opens on the requested course from a courseId query', () => {
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    given(mockCourse, other);
    mockSearchParams = new URLSearchParams('courseId=course-2');
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Other Course',
    );
  });

  it('renders nothing but the frame while courses load', () => {
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('points to Today when there is nothing to share', () => {
    given();
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Nothing to share yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a course on Today' })).toHaveAttribute(
      'href',
      '#/',
    );
  });

  it('saves the course as a file', async () => {
    given(mockCourse);
    mockBuildCourseFile.mockResolvedValue('course file contents');
    render(<SharePage />);
    otherWay('Course file');
    fireEvent.click(screen.getByRole('button', { name: 'Save course file' }));
    await waitFor(() =>
      expect(downloadTextFile).toHaveBeenCalledWith(
        'course file contents',
        'Test Course.lacuna',
        'application/json',
      ),
    );
    expect(mockBuildCourseFile).toHaveBeenCalledWith(mockCourse.id);
  });

  it('opens one other way at a time, closes it on a second press, and keeps outputs', async () => {
    given(mockCourse);
    mockCourseCards = [
      { conceptId: 'concept-export-card', front: 'Question', back: 'Answer' } as Card,
    ];
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.getByRole('button', { name: 'Share code' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    expect(await screen.findByRole('textbox', { name: 'Generated share code' })).toHaveValue(
      'LAC2-test-code',
    );

    otherWay('Plain text');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export cards as plain text' }));
    expect(screen.getByRole('textbox', { name: 'Generated plain-text export' })).toHaveValue(
      'card front\tcard back',
    );

    otherWay('Share code');
    expect(screen.getByRole('textbox', { name: 'Generated share code' })).toHaveValue(
      'LAC2-test-code',
    );
    otherWay('Share code');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
  });

  it('creates a QR code', async () => {
    given(mockCourse);
    render(<SharePage />);
    otherWay('QR code');
    fireEvent.click(screen.getByRole('button', { name: 'Create QR code' }));
    expect(await screen.findByTestId('qr-code')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'QR code text' })).toHaveValue('LAC2-qr-code');
  });

  it('keeps outputs for the same course and clears them for another', async () => {
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    given(mockCourse, other);
    render(<SharePage />);
    otherWay('Share code');
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    await screen.findByRole('textbox', { name: 'Generated share code' });

    chooseCourse('Test Course');
    expect(screen.getByRole('textbox', { name: 'Generated share code' })).toBeInTheDocument();

    chooseCourse('Other Course');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Other Course',
    );
  });

  it('lists each course with its size in the picker', () => {
    given(mockCourse, { ...mockCourse, id: 'course-2', name: 'Other Course' });
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Course to share' }));
    expect(screen.getByRole('menuitem', { name: /^Test Course/ })).toHaveTextContent(
      '1 lesson · 1 card',
    );
  });

  it('rings link creation from the announcement without publishing', () => {
    given(mockCourse);
    mockSearchParams = new URLSearchParams('highlight=share-link');
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Create share link' })).toHaveClass(
      'ring-2',
      'ring-accent',
    );
    expect(mockPublishShareLink).not.toHaveBeenCalled();
  });

  it('does not ring link creation on an ordinary visit', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Create share link' })).not.toHaveClass(
      'ring-accent',
    );
  });

  it.each([false, true])('creates a share link for the course (desktop: %s)', async (desktop) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: desktop },
    });
    const shareId = 'a'.repeat(32);
    given(mockCourse);
    mockPublishShareLink.mockResolvedValue({ shareId, revision: 1, byteSize: 128 });
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${desktop ? 'https://getlacuna.app' : window.location.origin}/#/s/${shareId}`,
    );
    expect(mockPublishShareLink).toHaveBeenCalledWith(mockCourse.id);
    expect(screen.getByText(/^Revision 1/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith('Share link ready.', 'positive');
  });

  it('shows a live link for a course that already has one, without publishing', async () => {
    const shareId = 'c'.repeat(32);
    given(linked(shareId, 3));
    render(<SharePage />);
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${shareId}`,
    );
    expect(screen.getByText(/^Revision 3 · updated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update link' })).toBeInTheDocument();
    expect(mockPublishShareLink).not.toHaveBeenCalled();
    await waitFor(() => expect(mockReadShareCredentials).toHaveBeenCalledWith(shareId));
  });

  it('updates a live link in place', async () => {
    const shareId = 'c'.repeat(32);
    given(linked(shareId, 1));
    mockPublishShareLink.mockResolvedValue({ shareId, revision: 2, byteSize: 128 });
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Update link' }));
    await screen.findByText(/^Revision 2/);
    expect(mockNotify).toHaveBeenCalledWith('Link updated to revision 2.', 'positive');
  });

  it('stops sharing after inline confirmation', async () => {
    given(linked('d'.repeat(32), 2));
    mockUnpublishShareLink.mockResolvedValue(undefined);
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, stop sharing' }));
    await waitFor(() => expect(mockUnpublishShareLink).toHaveBeenCalledWith(mockCourse.id));
    expect(await screen.findByRole('button', { name: 'Create share link' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith(
      'Share link removed. Students keep their copies but will not receive updates.',
      'positive',
    );
  });

  it('notifies when share link creation fails', async () => {
    given(mockCourse);
    mockPublishShareLink.mockRejectedValue(new Error('Too large.'));
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Too large.', 'negative'));
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('offers to replace a link created on another device', async () => {
    given(linked('e'.repeat(32), 2));
    mockReadShareCredentials.mockResolvedValue(null);
    const replacementId = 'f'.repeat(32);
    mockPublishShareLink.mockResolvedValue({ shareId: replacementId, revision: 2, byteSize: 128 });
    render(<SharePage />);
    await screen.findByText(/created on another device/);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, replace it' }));
    await waitFor(() =>
      expect(mockPublishShareLink).toHaveBeenCalledWith(mockCourse.id, { replaceLink: true }),
    );
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${replacementId}`,
    );
  });

  it('switches to replacement when an update finds the link belongs elsewhere', async () => {
    given(linked('b'.repeat(32), 2));
    mockPublishShareLink.mockRejectedValue(
      new ShareLinkNeedsReplacementError('This link was created on another device.'),
    );
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Update link' }));
    await screen.findByText(/created on another device/);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith('This link was created on another device.', 'negative');
  });

  it('ignores a link that finishes after switching course', async () => {
    const courseA = { ...mockCourse, id: 'course-a', name: 'Course A' };
    const courseB = { ...mockCourse, id: 'course-b', name: 'Course B' };
    given(courseA, courseB);
    let resolvePublish!: (value: { shareId: string; revision: number; byteSize: number }) => void;
    mockPublishShareLink.mockReturnValueOnce(new Promise((resolve) => (resolvePublish = resolve)));
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    chooseCourse('Course B');
    await act(async () => resolvePublish({ shareId: 'a'.repeat(32), revision: 1, byteSize: 128 }));
    expect(mockPublishShareLink).toHaveBeenCalledWith(courseA.id);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('makes sending a newer revision the primary action when the link is behind', () => {
    given(linked('c'.repeat(32), 5, { shareRevision: 3 }));
    render(<SharePage />);
    expect(screen.getByText(/^Revision 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send revision 5' })).toBeInTheDocument();
  });

  it('warns that a code drops media and names the affected cards', () => {
    given(mockCourse);
    mockCourseCards = [
      {
        id: 'media-card',
        conceptId: 'concept-media-card',
        front: 'What is shown? lacuna-asset://' + 'a'.repeat(64),
        back: 'Answer',
      } as Card,
    ];
    render(<SharePage />);
    expect(screen.queryByText(/won.t be included/)).not.toBeInTheDocument();
    otherWay('Share code');
    expect(screen.getByText(/Media in 1 card won.t be included/)).toBeInTheDocument();
    expect(screen.getByText('What is shown?')).toBeInTheDocument();
    otherWay('Course file');
    expect(screen.queryByText(/won.t be included/)).not.toBeInTheDocument();
  });

  it('counts an occlusion card as media even though its diagram is not in the card text', () => {
    given(mockCourse);
    mockCourseCards = [
      {
        id: 'occlusion-card',
        conceptId: 'concept-occlusion-card',
        front: 'Label 1 of 3 — Plant cell',
        back: 'Label 1 of 3 — Plant cell\n\nNucleus',
        occlusionRegionId: 'region-1',
      } as Card,
    ];
    render(<SharePage />);
    otherWay('QR code');
    expect(screen.getByText(/Media in 1 card/)).toBeInTheDocument();
    expect(screen.getByText('Label 1 of 3 — Plant cell')).toBeInTheDocument();
  });

  it('does not warn about media when the course has none', () => {
    given(mockCourse);
    mockCourseCards = [
      { conceptId: 'concept-plain-card', front: 'Plain text', back: 'Answer' } as Card,
    ];
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.queryByText(/Media in/)).not.toBeInTheDocument();
  });

  it('offers publishing for a course that has never been published', async () => {
    given(mockCourse);
    render(<SharePage />);
    otherWay('Share code');
    expect(
      screen.getByText('Unpublished copies won’t receive your later edits.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish course' }));
    await waitFor(() => expect(publishCourse).toHaveBeenCalledWith(mockCourse.id));
  });

  it('shows the published revision and refreshes an existing code on update', async () => {
    given({
      ...mockCourse,
      distribution: { lineageId: 'lineage-1', revision: 3, publishedAt: Date.now() - 60_000 },
    });
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.getByText(/^Revision 3 · published/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    await screen.findByRole('textbox', { name: 'Generated share code' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(buildCourseShareCode).toHaveBeenCalledTimes(2));
  });
});
