import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedImportPanel } from './UnifiedImportPanel';
import type { Course } from '../../db/types';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../../db/importEngine', () => ({
  detectFormat: () => ({ format: 'unknown' as const, confidence: 0 }),
  FORMAT_LABELS: {
    csv: 'CSV',
    tsv: 'TSV',
    'markdown-table': 'Markdown table',
    'markdown-list': 'Markdown list',
    json: 'JSON',
    'share-code': 'Share code',
    'plain-text': 'Plain text',
    unknown: 'Unknown',
  },
  parseImportAuto: () => ({ cards: [], skipped: 0 }),
}));

vi.mock('../../db/repository', () => ({
  checkDuplicatesBatch: vi.fn(() => Promise.resolve(new Set())),
}));

vi.mock('../../db/apkgImport', () => ({
  parseApkg: vi.fn(),
}));

let mockDecodedPayload: Record<string, unknown> = {};

vi.mock('../../db/share', () => ({
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

vi.mock('../../db/mergeImport', () => ({
  isLineagePayload: (payload: Record<string, unknown>) =>
    payload.v === 2 && typeof payload.li === 'string' && typeof payload.rv === 'number',
  findCourseForLineage: () =>
    mockFindCourseForLineage ? mockFindCourseForLineage() : Promise.resolve(undefined),
  mergeLineageUpdate: (...args: unknown[]) => mockMergeLineageUpdate(...args),
}));

vi.mock('../ui/icons', () => ({
  UploadIcon: () => <svg data-testid="upload-icon" />,
  DownloadIcon: () => <svg data-testid="download-icon" />,
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

const mockCourse: Course = {
  id: 'course-1',
  name: 'Test Course',
  description: '',
  createdAt: Date.now(),
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
  mockDecodedPayload = {};
  mockFindCourseForLineage = undefined;
  mockMergeLineageUpdate.mockReset();
});

async function readCode() {
  render(<UnifiedImportPanel onImport={vi.fn()} showShareImport />);
  fireEvent.click(screen.getByText('Import share code'));
  fireEvent.change(
    screen.getByPlaceholderText('Paste a Lacuna share code here (it starts with LAC)...'),
    { target: { value: 'LAC2-some-code' } },
  );
  fireEvent.click(screen.getByText('Read code'));
  await screen.findByRole('heading', { level: 3 });
}

describe('UnifiedImportPanel share-code merge routing (Arc 7 §7.5)', () => {
  it('a plain (non-distributed) import is unaffected', async () => {
    mockDecodedPayload = { v: 2 };
    await readCode();
    expect(screen.getByText('Ready to import')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add to my courses'));
    await waitFor(() => expect(screen.queryByText('Ready to import')).not.toBeInTheDocument());
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

    await readCode();
    expect(screen.getByText('Course update')).toBeInTheDocument();
    expect(screen.getByText('My Copy')).toBeInTheDocument();
    expect(screen.getByText(/revision 1 → 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Update course'));
    await waitFor(() => expect(mockMergeLineageUpdate).toHaveBeenCalled());
    expect(mockMergeLineageUpdate).toHaveBeenCalledWith('course-2', mockDecodedPayload);
    await screen.findByText(/Updated the course/);
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
      conflictCount: 3,
    });

    await readCode();
    fireEvent.click(screen.getByText('Update course'));
    await screen.findByText(/3 changes are waiting for your review\./);
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

    await readCode();
    expect(screen.getByText(/You already have the latest version of/)).toBeInTheDocument();
    expect(screen.queryByText('Update course')).not.toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(mockMergeLineageUpdate).not.toHaveBeenCalled();
  });
});
