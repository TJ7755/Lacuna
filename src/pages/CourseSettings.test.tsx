import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CourseSettings } from './CourseSettings';
import type { Card, Course } from '../db/types';

const mockNavigate = vi.fn();
const mockUpdateCourse = vi.fn().mockResolvedValue(undefined);
const mockUpdateCourseAssessment = vi.fn().mockResolvedValue(undefined);
const mockDeleteCourse = vi.fn().mockResolvedValue(undefined);
const mockSnapshotCourse = vi.fn().mockResolvedValue({ course: 'snapshot' });
const mockRestoreCourse = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();
const mockOptimiserReset = vi.fn();
const mockOptimiserRun = vi.fn();

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));

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
  useCourse: () => mockCourse,
  useCourseCards: () => mockCards,
  useCourseAssessments: () =>
    mockCourse
      ? [
          {
            id: 'final-1',
            courseId: mockCourse.id,
            name: 'Final exam',
            kind: 'final',
            examDate: mockCourse.examDate,
            afterLessonId: null,
            coverageMode: 'prefix',
            excludedCardIds: [],
            createdAt: mockCourse.createdAt,
          },
        ]
      : [],
  useLessons: () => [],
  usePracticeNodes: () => [],
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
  createCourseAssessment: vi.fn().mockResolvedValue(undefined),
  updateCourseAssessment: (id: string, changes: Record<string, unknown>) =>
    mockUpdateCourseAssessment(id, changes),
  deleteCourseAssessment: vi.fn().mockResolvedValue(undefined),
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
  mockUpdateCourseAssessment.mockClear();
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

  it('renders the grouped section headings and no "Save changes" bar', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessments' })).toBeInTheDocument();
    // "Danger zone" has no separate group heading — DangerZoneSection labels itself —
    // so assert on its presence rather than a specific role.
    expect(screen.getAllByText('Danger zone').length).toBeGreaterThan(0);
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  });

  it('edits the final date through the shared assessment editor', () => {
    mockCourse = {
      ...course,
      examDate: Date.UTC(2026, 5, 10, 14, 30),
      timeZone: 'UTC',
    };
    renderPage();

    fireEvent.click(screen.getByLabelText('Edit Final exam'));
    fireEvent.click(screen.getByRole('button', { name: 'Date and time' }));
    fireEvent.click(screen.getByRole('button', { name: '20 June 2026' }));

    expect(screen.getByRole('button', { name: 'Date and time' })).toHaveTextContent('20 Jun 2026');
    expect(mockUpdateCourseAssessment).not.toHaveBeenCalled();
  });

  it('commits the course name on blur, not on every keystroke', () => {
    renderPage();
    const nameInput = screen.getByDisplayValue('Original course');
    fireEvent.change(nameInput, { target: { value: 'Renamed course' } });
    expect(mockUpdateCourse).not.toHaveBeenCalled();

    fireEvent.blur(nameInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ name: 'Renamed course' }),
    );
  });

  it('commits the exam objective toggle immediately on change', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Secure topics'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ examObjective: 'securedTopics' }),
    );
  });

  it('commits unlock mode immediately when a radio option is picked', () => {
    renderPage();
    fireEvent.click(screen.getByText('Linear'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ unlockMode: 'linear' }),
    );
  });

  it('switching unlock mode shows/hides linear cadence inputs', () => {
    renderPage();
    expect(screen.queryByText('Days between lessons')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Linear'));
    expect(screen.getByText('Days between lessons')).toBeInTheDocument();
  });

  it('commits linear cadence interval days on blur, not on every keystroke', () => {
    renderPage();
    fireEvent.click(screen.getByText('Linear'));
    mockUpdateCourse.mockClear();

    const intervalInput = screen.getByLabelText(/Days between lessons/);
    fireEvent.change(intervalInput, { target: { value: '14' } });
    expect(mockUpdateCourse).not.toHaveBeenCalled();

    fireEvent.blur(intervalInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ linearCadence: expect.objectContaining({ intervalDays: 14 }) }),
    );
  });

  it('falls back to the current value when a practice field is left blank on blur', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '' } });
    fireEvent.blur(maxGapInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 5 }),
    );
  });

  it('accepts a zero value for the far/near thresholds and urgent window on blur', () => {
    renderPage();
    const farInput = screen.getByLabelText(/Threshold \(exam not near\)/);
    fireEvent.change(farInput, { target: { value: '0' } });
    fireEvent.blur(farInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceThresholdMinutesFar: 0 }),
    );

    const nearInput = screen.getByLabelText(/Threshold \(exam near\)/);
    fireEvent.change(nearInput, { target: { value: '0' } });
    fireEvent.blur(nearInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceThresholdMinutesNear: 0 }),
    );

    const urgentInput = screen.getByLabelText(/Urgent window/);
    fireEvent.change(urgentInput, { target: { value: '0' } });
    fireEvent.blur(urgentInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceUrgentWindowDays: 0 }),
    );
  });

  it('falls back to the current value when the maximum lesson gap is set to zero on blur', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '0' } });
    fireEvent.blur(maxGapInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 5 }),
    );
  });

  it('round-trips a valid practice field edit on blur', () => {
    renderPage();
    const maxGapInput = screen.getByDisplayValue('5');
    fireEvent.change(maxGapInput, { target: { value: '9' } });
    fireEvent.blur(maxGapInput);
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ practiceMaxGap: 9 }),
    );
  });

  it('commits auto-practice immediately on toggle', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Auto-practice'));
    expect(mockUpdateCourse).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ autoPractice: false }),
    );
  });

  it('commits lessonViewMode: edit immediately when Edit is picked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Edit/ }));
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

  it('rejects an invalid learning steps format on blur without committing', () => {
    renderPage();
    const learningStepsInput = screen.getByDisplayValue('1m, 10m');
    fireEvent.change(learningStepsInput, { target: { value: 'not-a-step' } });
    fireEvent.blur(learningStepsInput);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining('Invalid learning steps format'),
      'negative',
    );
    expect(mockUpdateCourse).not.toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        fsrsParameters: expect.objectContaining({ learning_steps: ['not-a-step'] }),
      }),
    );
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
    await vi.waitFor(() => expect(mockRestoreCourse).toHaveBeenCalledWith({ course: 'snapshot' }));
  });
});
