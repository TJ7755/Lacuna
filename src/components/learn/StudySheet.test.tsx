import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import { StudySheet } from './StudySheet';

const mockNavigate = vi.fn();
let mockCourses: Course[] = [];
const mockFlows: Record<
  string,
  {
    course: Course;
    snapshot: { recurringPracticeEligibleCount: number };
    decision: { kind: 'step'; step: { kind: 'lesson'; lessonId: string; label: string } };
  }
> = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../state/useCourseData', () => ({
  useCourses: () => mockCourses,
  useCourse: (courseId: string | undefined) =>
    mockCourses.find((course) => course.id === courseId) ?? null,
}));

vi.mock('../../state/useCourseStudyFlow', () => ({
  useCourseStudyFlow: (courseId: string | undefined) =>
    courseId ? (mockFlows[courseId] ?? undefined) : undefined,
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast', vi.fn()],
  speedMultiplier: () => 0,
}));

const chemistry: Course = {
  id: 'chem',
  name: 'Chemistry',
  description: '',
  createdAt: 0,
  examDate: Date.now() + 86_400_000,
  timeZone: 'UTC',
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 30,
  practiceThresholdMinutesNear: 15,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 5,
};

function renderSheet(courseId: string | null = null) {
  return render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudySheet courseId={courseId} onClose={vi.fn()} />
      </MemoryRouter>
    </LazyMotion>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockCourses = [chemistry];
  mockFlows.chem = {
    course: chemistry,
    snapshot: { recurringPracticeEligibleCount: 0 },
    decision: {
      kind: 'step',
      step: { kind: 'lesson', lessonId: 'l1', label: 'Atomic structure' },
    },
  };
});

describe('StudySheet', () => {
  it('crossfades from the course picker to that course\'s options', async () => {
    renderSheet();
    expect(screen.getByRole('heading', { name: 'Which course?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chemistry' }));

    expect(screen.getByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Which course?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue: Atomic structure' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Chemistry' })).toHaveFocus(),
    );
  });

  it('returns to the picker without leaving the sheet', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Chemistry' }));
    fireEvent.click(screen.getByRole('button', { name: 'All courses' }));

    expect(screen.getByRole('heading', { name: 'Which course?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chemistry' })).not.toBeInTheDocument();
  });

  it('keeps the course title while its options load', () => {
    delete mockFlows.chem;
    renderSheet('chem');

    expect(screen.getByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
    expect(screen.getByText('Working out what is next…')).toBeInTheDocument();
  });
});
