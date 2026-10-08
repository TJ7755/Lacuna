import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { decodeShare, importSharePayload } from '../../db/share';
import { SharedCourseImport } from './SharedCourseImport';
import type { Course } from '../../db/types';

const mockNotify = vi.fn();

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

let mockDecodedPayload: Record<string, unknown> = {};

vi.mock('../../db/share', () => ({
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
    noteCount: 3,
  })),
}));

const mockBuildCourseFile = vi.fn();
const mockDecodeCourseFile = vi.fn();
const mockWithCourseFileAssets = vi.fn((_file: unknown, callback: () => Promise<unknown>) =>
  callback(),
);
vi.mock('../../db/courseFile', () => ({
  buildCourseFile: (...args: unknown[]) => mockBuildCourseFile(...args),
  decodeCourseFile: (...args: unknown[]) => mockDecodeCourseFile(...args),
  withCourseFileAssets: (file: unknown, callback: () => Promise<unknown>) =>
    mockWithCourseFileAssets(file, callback),
  MAX_COURSE_FILE_BYTES: 100 * 1024 * 1024,
}));

let mockFindCourseForLineage: (() => Promise<Course | undefined>) | undefined;
const mockMergeLineageUpdate = vi.fn();
const mockImportLineageFirstTime = vi.fn();

vi.mock('../../db/mergeImport', () => ({
  isLineagePayload: (payload: Record<string, unknown>) =>
    payload.v === 2 && typeof payload.li === 'string' && typeof payload.rv === 'number',
  findCourseForLineage: () =>
    mockFindCourseForLineage ? mockFindCourseForLineage() : Promise.resolve(undefined),
  importLineageFirstTime: (...args: unknown[]) => mockImportLineageFirstTime(...args),
  mergeLineageUpdate: (...args: unknown[]) => mockMergeLineageUpdate(...args),
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid="button"
    >
      {children}
    </button>
  ),
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

beforeEach(() => {
  mockNotify.mockClear();
  vi.mocked(importSharePayload).mockClear();
  mockBuildCourseFile.mockReset();
  mockDecodeCourseFile.mockReset();
  mockWithCourseFileAssets.mockClear();
  mockDecodedPayload = {};
  mockFindCourseForLineage = undefined;
  mockImportLineageFirstTime.mockReset();
  mockMergeLineageUpdate.mockReset();
});

describe('SharedCourseImport with course codes and files', () => {
  it('ignores a slow code read after a newer file preview', async () => {
    let finish!: (payload: Awaited<ReturnType<typeof decodeShare>>) => void;
    vi.mocked(decodeShare).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const file = { payload: { v: 2 }, assets: [] };
    mockDecodeCourseFile.mockResolvedValue(file);
    render(<SharedCourseImport />);
    fireEvent.change(screen.getByLabelText('Share link or code to import'), {
      target: { value: 'LAC2-older' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
    fireEvent.change(screen.getByLabelText('Course file to import'), {
      target: { files: [new File(['contents'], 'Biology.lacuna')] },
    });
    await screen.findByText('Ready to import');
    await act(async () => {
      finish({ v: 2 } as Awaited<ReturnType<typeof decodeShare>>);
    });
    fireEvent.click(screen.getByText('Add to my courses'));
    await waitFor(() =>
      expect(mockWithCourseFileAssets).toHaveBeenCalledWith(file, expect.any(Function)),
    );
  });

  it('ignores a slow file read after a newer code preview', async () => {
    let finish!: (file: unknown) => void;
    mockDecodeCourseFile.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<SharedCourseImport />);
    fireEvent.change(screen.getByLabelText('Course file to import'), {
      target: { files: [new File(['contents'], 'Biology.lacuna')] },
    });
    await waitFor(() => expect(mockDecodeCourseFile).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Share link or code to import'), {
      target: { value: 'LAC2-newer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
    await screen.findByText('Ready to import');
    await act(async () => {
      finish({ payload: { v: 2 }, assets: [] });
    });
    fireEvent.click(screen.getByText('Add to my courses'));
    await waitFor(() => expect(importSharePayload).toHaveBeenCalledWith(mockDecodedPayload));
    expect(mockWithCourseFileAssets).not.toHaveBeenCalled();
  });

  it('previews a chosen course file without importing until confirmed', async () => {
    const file = { format: 'lacuna-course', version: 1, payload: { v: 2 }, assets: [] };
    mockDecodeCourseFile.mockResolvedValue(file);
    render(<SharedCourseImport />);
    fireEvent.change(screen.getByLabelText('Course file to import'), {
      target: { files: [new File(['contents'], 'Biology.lacuna')] },
    });
    await screen.findByText('Ready to import');
    expect(mockDecodeCourseFile).toHaveBeenCalledWith('contents');
    expect(importSharePayload).not.toHaveBeenCalled();
    expect(mockWithCourseFileAssets).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Add to my courses'));
    await waitFor(() =>
      expect(mockWithCourseFileAssets).toHaveBeenCalledWith(file, expect.any(Function)),
    );
    expect(importSharePayload).toHaveBeenCalledWith(file.payload);
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('Added 1 course and 2 cards.', 'positive'),
    );
  });

  it('clears an earlier preview when the next course file is corrupt', async () => {
    mockDecodeCourseFile.mockResolvedValueOnce({ payload: { v: 2 }, assets: [] });
    mockDecodeCourseFile.mockRejectedValueOnce(
      new Error('The course file contains corrupt media.'),
    );
    render(<SharedCourseImport />);
    const input = screen.getByLabelText('Course file to import');
    fireEvent.change(input, { target: { files: [new File(['contents'], 'Biology.lacuna')] } });
    await screen.findByText('Ready to import');
    fireEvent.change(input, { target: { files: [new File(['bad data'], 'Biology.lacuna')] } });
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith(
        'The course file contains corrupt media.',
        'negative',
      ),
    );
    expect(screen.queryByText('Ready to import')).not.toBeInTheDocument();
    expect(importSharePayload).not.toHaveBeenCalled();
  });

  it('shows import section with textarea', () => {
    render(<SharedCourseImport />);
    expect(screen.getByText('Import a shared course')).toBeInTheDocument();
    expect(screen.queryByText(/share-code encodings/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste a share link or code')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Share link or code to import' }),
    ).toBeInTheDocument();
  });

  describe('decode-time merge routing (Arc 7 §7.5)', () => {
    async function inspectCode() {
      render(<SharedCourseImport />);
      fireEvent.change(
        screen.getByPlaceholderText('Paste a share link or code'),
        { target: { value: 'LAC2-some-code' } },
      );
      fireEvent.click(screen.getByText('Read code'));
      await screen.findByRole('heading', { level: 3 });
    }

    it('a plain (non-distributed) import is unaffected', async () => {
      mockDecodedPayload = { v: 2 };
      await inspectCode();
      expect(screen.getByText('Ready to import')).toBeInTheDocument();
      expect(screen.getByText('Test Course').closest('p')).toHaveTextContent(
        'Test Course — 1 lesson, 3 notes and 2 cards',
      );
      fireEvent.click(screen.getByText('Add to my courses'));
      await waitFor(() => expect(mockNotify).toHaveBeenCalled());
      expect(mockMergeLineageUpdate).not.toHaveBeenCalled();
      expect(mockImportLineageFirstTime).not.toHaveBeenCalled();
    });

    it('preserves lineage tracking on the first import of a published course', async () => {
      mockDecodedPayload = { v: 2, li: 'lineage-1', rv: 1 };
      mockImportLineageFirstTime.mockResolvedValue({
        course: { ...mockCourse, id: 'shared-copy' },
      });

      await inspectCode();
      fireEvent.click(screen.getByText('Add to my courses'));

      await waitFor(() =>
        expect(mockImportLineageFirstTime).toHaveBeenCalledWith(mockDecodedPayload),
      );
      expect(mockNotify).toHaveBeenCalledWith('Added 1 course and 2 cards.', 'positive');
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
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining('Updated the course'),
          'positive',
        ),
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
      expect(screen.getByText(/You already have the latest version of/)).toBeInTheDocument();
      expect(screen.queryByText('Update course')).not.toBeInTheDocument();
      expect(screen.getByText('Close')).toBeInTheDocument();
      expect(mockMergeLineageUpdate).not.toHaveBeenCalled();
    });
  });
});
