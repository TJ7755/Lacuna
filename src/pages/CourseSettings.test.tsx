import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CourseSettings } from './CourseSettings';
import type { Card, Course } from '../db/types';

const mockNavigate = vi.fn();
const mockUpdateCourse = vi.fn().mockResolvedValue(undefined);
const mockDeleteCourse = vi.fn().mockResolvedValue(undefined);
const mockSnapshotCourse = vi.fn().mockResolvedValue({ course: 'snapshot' });
const mockRestoreCourse = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();
const mockOptimiserReset = vi.fn();
const mockOptimiserRun = vi.fn();

let mockCourse: Course | null | undefined;
let mockCards: Card[] | undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../state/useCourseData', () => ({
  useCourseCards: () => mockCards,
  useCourseExamDates: () => [],
  useLessons: () => [],
  usePracticeNodes: () => [],
}));

// CourseSettings resolves the course itself via useLiveQuery + db.courses.get
// (mapping a missing row to null, matching CoursePath's reachable not-found
// pattern), rather than the useCourse hook — see the finding this test now covers.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mockCourse,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../db/repository', () => ({
  updateCourse: (id: string, changes: Record<string, unknown>) => mockUpdateCourse(id, changes),
  deleteCourse: (id: string) => mockDeleteCourse(id),
  snapshotCourse: (id: string) => mockSnapshotCourse(id),
  restoreCourse: (snapshot: unknown) => mockRestoreCourse(snapshot),
  createCourseExamDate: vi.fn().mockResolvedValue(undefined),
  updateCourseExamDate: vi.fn().mockResolvedValue(undefined),
  deleteCourseExamDate: vi.fn().mockResolvedValue(undefined),
  updateLesson: vi.fn().mockResolvedValue(undefined),
  deleteLesson: vi.fn().mockResolvedValue(undefined),
  reorderLessons: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock('../state/useOptimiser', () => ({
  useOptimiser: () => ({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
    run: mockOptimiserRun,
    reset: mockOptimiserReset,
  }),
}));

vi.mock('../state/optimiseSetting', () => ({
  useAutoOptimiseDefault: () => [true, vi.fn()],
  optimiseEnabledForDeck: () => true,
}));

const course: Course = {
  id: 'course-1',
  name: 'Original course',
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
  unlockMode: 'semi-linear',
  autoPractice: true,
  practiceThresholdMinutesFar: 30,
  practiceThresholdMinutesNear: 15,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 5,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/settings']}>
      <Routes>
        <Route path="/course/:courseId/settings" element={<CourseSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = course;
  mockCards = [];
  mockUpdateCourse.mockClear();
  mockDeleteCourse.mockClear();
  mockSnapshotCourse.mockClear();
  mockRestoreCourse.mockClear();
  mockNotify.mockClear();
  mockNavigate.mockClear();
  mockOptimiserReset.mockClear();
  mockOptimiserRun.mockClear();
});

describe('CourseSettings', () => {
  it('shows a skeleton while loading', () => {
    mockCourse = undefined;
    renderPage();
    expect(screen.queryByDisplayValue('Original course')).not.toBeInTheDocument();
  });

  it('shows a not-found state when the course is missing', () => {
    mockCourse = null;
    renderPage();
    expect(screen.getByText('This course could not be found.')).toBeInTheDocument();
  });

  it('populates fields from the course', () => {
    renderPage();
    expect(screen.getByDisplayValue('Original course')).toBeInTheDocument();
  });

  it('does not reset the optimiser when the same course rerenders', () => {
    const view = renderPage();
    mockOptimiserReset.mockClear();

    view.rerender(
      <MemoryRouter initialEntries={['/course/course-1/settings']}>
        <Routes>
          <Route path="/course/:courseId/settings" element={<CourseSettings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockOptimiserReset).not.toHaveBeenCalled();
  });

  it('shows the draft exam date before it is saved', () => {
    mockCourse = {
      ...course,
      examDate: Date.UTC(2026, 5, 10, 14, 30),
      timeZone: 'UTC',
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Exam date and time' }));
    fireEvent.click(screen.getByRole('button', { name: '20 June 2026' }));

    expect(screen.getByText(/20 June 2026.*14:30.*UTC/)).toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('saves edits by calling updateCourse with unlockMode, linearCadence and practice fields', () => {
    renderPage();
    const nameInput = screen.getByDisplayValue('Original course');
    fireEvent.change(nameInput, { target: { value: 'Renamed course' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        name: 'Renamed course',
        unlockMode: 'semi-linear',
        linearCadence: expect.objectContaining({ intervalDays: 7 }),
        autoPractice: true,
        practiceThresholdMinutesFar: 30,
        practiceThresholdMinutesNear: 15,
        practiceUrgentWindowDays: 7,
        practiceMaxGap: 5,
      }),
    );
  });

  it('switching unlock mode shows/hides linear cadence inputs', () => {
    renderPage();
    expect(screen.queryByText('Days between lessons')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Linear'));
    expect(screen.getByText('Days between lessons')).toBeInTheDocument();
  });

  it('falls back to the current value when a practice field is left blank', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 5 }),
    );
  });

  it('accepts a zero value for the far/near thresholds and urgent window', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Threshold \(exam not near\)/), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText(/Threshold \(exam near\)/), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText(/Urgent window/), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        practiceThresholdMinutesFar: 0,
        practiceThresholdMinutesNear: 0,
        practiceUrgentWindowDays: 0,
      }),
    );
  });

  it('falls back to the current value when the maximum lesson gap is set to zero', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 5 }),
    );
  });

  it('round-trips a valid practice field edit', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '9' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 9 }),
    );
  });

  it('defaults the save payload to lessonViewMode: study when the course has none', () => {
    renderPage();
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ lessonViewMode: 'study' }),
    );
  });

  it('picking Edit saves lessonViewMode: edit', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Edit/ }));
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ lessonViewMode: 'edit' }),
    );
  });

  it('pre-populates the choice from an existing course value', () => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
    renderPage();
    const editRadio = screen.getByRole('radio', { name: /Edit/ });
    expect(editRadio).toBeChecked();
  });

  it('snapshots then deletes the course immediately, navigating away with an undo toast', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Delete course'));
    await vi.waitFor(() => expect(mockSnapshotCourse).toHaveBeenCalledWith('course-1'));
    await vi.waitFor(() => expect(mockDeleteCourse).toHaveBeenCalledWith('course-1'));
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining('deleted'),
      'neutral',
      expect.objectContaining({ actionLabel: 'Undo' }),
    );
  });

  it('restores the course from its snapshot when the undo toast action fires', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Delete course'));
    await vi.waitFor(() => expect(mockDeleteCourse).toHaveBeenCalledWith('course-1'));
    const [, , options] = mockNotify.mock.calls[mockNotify.mock.calls.length - 1];
    options.onAction();
    await vi.waitFor(() =>
      expect(mockRestoreCourse).toHaveBeenCalledWith({ course: 'snapshot' }),
    );
  });
});
