import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Course } from '../db/types';
import type { CourseSummary } from '../state/useCourseData';
import { StudyToday } from './StudyToday';

const mockNavigate = vi.fn();
let mockData: { courses: Course[]; summaries: Record<string, CourseSummary> } | undefined;

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../state/useCourseData', () => ({
  useCourseDashboardData: () => mockData,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

function course(id: string, name: string, archived = false): Course {
  return {
    id,
    name,
    description: '',
    archived,
    createdAt: id === 'course-1' ? 1 : 2,
    examDate: Date.now() + 86_400_000,
    timeZone: 'UTC',
    fsrsVersion: 6,
    fsrsParameters: {} as Course['fsrsParameters'],
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 30,
    practiceThresholdMinutesNear: 15,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
  };
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockData = undefined;
});

describe('StudyToday', () => {
  it('shows a loading state while course data resolves', () => {
    render(<StudyToday />);
    expect(screen.getByLabelText('Loading courses')).toBeInTheDocument();
  });

  it('excludes archived courses and shows existing summary context', () => {
    mockData = {
      courses: [course('course-1', 'Chemistry'), course('course-2', 'Archived', true)],
      summaries: {
        'course-1': { lessonCount: 4, cardCount: 28, mastery: 0.5, unreviewed: 3, eligible: 7 },
      },
    };
    render(<StudyToday />);
    expect(screen.getByText('Chemistry')).toBeInTheDocument();
    expect(screen.getByText('7 due · 4 lessons · 28 cards')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('always asks for a course even when there is only one', () => {
    mockData = {
      courses: [course('course-1', 'Chemistry')],
      summaries: {
        'course-1': { lessonCount: 1, cardCount: 5, mastery: 0, unreviewed: 5, eligible: 0 },
      },
    };
    render(<StudyToday />);
    expect(screen.getByRole('heading', { name: 'Choose a course' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('launches the selected course conductor', () => {
    mockData = {
      courses: [course('course-1', 'Chemistry')],
      summaries: {},
    };
    render(<StudyToday />);
    fireEvent.click(screen.getByRole('button', { name: /Chemistry/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study');
  });

  it('shows an empty state when there are no active courses', () => {
    mockData = { courses: [course('course-2', 'Archived', true)], summaries: {} };
    render(<StudyToday />);
    expect(screen.getByRole('heading', { name: 'No active courses' })).toBeInTheDocument();
  });
});
