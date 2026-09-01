import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalExamLifecycleController } from './FinalExamLifecycleController';
import type { Course } from '../../db/types';
import type * as FinalExamLifecycle from '../../state/finalExamLifecycle';

const { updateCourse, notify, navigate } = vi.hoisted(() => ({
  updateCourse: vi.fn(),
  notify: vi.fn(),
  navigate: vi.fn(),
}));
let afterFinalExam: 'ask' | 'archive' | 'keep-revising' = 'ask';
let courses: Course[] = [];

vi.mock('../../db/repository', () => ({ updateCourse }));
vi.mock('../../state/useCourseData', () => ({ useCourses: () => courses }));
vi.mock('../../state/finalExamLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof FinalExamLifecycle>();
  return { ...actual, useAfterFinalExamPolicy: () => [afterFinalExam, vi.fn()] };
});
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const passed = {
  id: 'course-1',
  name: 'Biology',
  examDate: Date.now() - 1_000,
  archived: false,
} as Course;

beforeEach(() => {
  localStorage.clear();
  courses = [passed];
  afterFinalExam = 'ask';
  updateCourse.mockReset().mockResolvedValue(undefined);
  notify.mockReset();
  navigate.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('FinalExamLifecycleController', () => {
  it('asks before changing a course under the default policy', () => {
    render(<FinalExamLifecycleController />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(updateCourse).not.toHaveBeenCalled();
  });

  it('archives a passed final exam automatically only under the explicit policy', async () => {
    afterFinalExam = 'archive';
    render(<FinalExamLifecycleController />);
    await waitFor(() => expect(updateCourse).toHaveBeenCalledWith('course-1', { archived: true }));
  });

  it('does not override an explicit Keep revising choice for the same exam', async () => {
    localStorage.setItem('lacuna.handledFinalExams', JSON.stringify({ 'course-1': passed.examDate }));
    afterFinalExam = 'archive';
    render(<FinalExamLifecycleController />);

    await waitFor(() => expect(updateCourse).not.toHaveBeenCalled());
  });

  it('wakes when a final exam crosses its timestamp without another render', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    courses = [{ ...passed, examDate: Date.now() + 1_000 }];
    render(<FinalExamLifecycleController />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_001));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('uses the current clock when changed course data introduces an already-passed exam', () => {
    vi.useFakeTimers();
    const mountedAt = new Date('2026-09-01T08:00:00Z');
    vi.setSystemTime(mountedAt);
    courses = [];
    const { rerender } = render(<FinalExamLifecycleController />);

    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    courses = [{ ...passed, examDate: mountedAt.getTime() + 2 * 60 * 60 * 1_000 }];
    rerender(<FinalExamLifecycleController />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps revising without asking again for the same exam', () => {
    const { rerender } = render(<FinalExamLifecycleController />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep revising' }));
    rerender(<FinalExamLifecycleController />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes Set a new exam date directly to the final assessment editor', () => {
    render(<FinalExamLifecycleController />);
    fireEvent.click(screen.getByRole('button', { name: 'Set a new exam date' }));
    expect(navigate).toHaveBeenCalledWith('/course/course-1/settings?editFinalExam=1');
  });

  it('does nothing under Keep revising and ignores future final exams', () => {
    afterFinalExam = 'keep-revising';
    courses = [{ ...passed, examDate: Date.now() + 10_000 }];
    render(<FinalExamLifecycleController />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateCourse).not.toHaveBeenCalled();
  });
});
