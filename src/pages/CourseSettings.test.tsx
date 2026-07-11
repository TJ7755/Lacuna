import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CourseSettings } from './CourseSettings';
import type { Card, Course } from '../db/types';

const mockNavigate = vi.fn();
const mockUpdateCourse = vi.fn().mockResolvedValue(undefined);
const mockDeleteCourse = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();

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
    run: vi.fn(),
    reset: vi.fn(),
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
  mockNotify.mockClear();
  mockNavigate.mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('confirms then deletes the course and navigates away without an undo toast', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Delete course'));
    expect(window.confirm).toHaveBeenCalled();
    await vi.waitFor(() => expect(mockDeleteCourse).toHaveBeenCalledWith('course-1'));
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockNotify).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ actionLabel: 'Undo' }),
    );
  });
});
