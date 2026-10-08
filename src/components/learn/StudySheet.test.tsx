import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouterDom from 'react-router-dom';
import type { Card, Course } from '../../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import { StudySheet } from './StudySheet';

const mockNavigate = vi.fn();
let mockCourses: Course[] = [];
const mockFlows: Record<
  string,
  {
    course: Course;
    snapshot: { recurringPracticeEligibleCount: number; practiceByKey: Map<string, unknown> };
    decision: { kind: 'step'; step: { kind: 'lesson'; lessonId: string; label: string } };
    lessonCardsById: Map<string, Card[]>;
    meanReviewSeconds: number;
  }
> = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../state/useCourseData', () => ({
  useCourses: () => mockCourses,
  useLessons: () => [{ id: 'l1', name: 'Atomic structure' }],
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
  updatedAt: 0,
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

function renderSheet(
  courseId: string | null = null,
  { onClose = vi.fn(), otherWays = true }: { onClose?: () => void; otherWays?: boolean } = {},
) {
  return render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <StudySheet courseId={courseId} otherWays={otherWays} onClose={onClose} />
      </MemoryRouter>
    </LazyMotion>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockCourses = [chemistry];
  mockFlows.chem = {
    course: chemistry,
    snapshot: { recurringPracticeEligibleCount: 0, practiceByKey: new Map() },
    decision: {
      kind: 'step',
      step: { kind: 'lesson', lessonId: 'l1', label: 'Atomic structure' },
    },
    lessonCardsById: new Map([
      ['l1', [{ lastReviewed: 1 }, { lastReviewed: null }] as Card[]],
    ]),
    meanReviewSeconds: 15,
  };
});

describe('StudySheet', () => {
  it('previews the session it will start, with the due reviews offered after', () => {
    mockFlows.chem.snapshot.recurringPracticeEligibleCount = 6;
    renderSheet('chem');
    const steps = screen.getByRole('list', { name: "Today's session" });
    expect(steps).toHaveTextContent('Learn Atomic structure');
    expect(steps).toHaveTextContent('2 cards, 1 new');
    expect(steps).toHaveTextContent('Review due cards6 cards, offered next');
    // One review plus a new card counted three times is a minute; six reviews round up to two.
    expect(screen.getByText('About 3 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study');
    fireEvent.click(screen.getByRole('button', { name: /^Only review due cards/ }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study?review=due');
  });

  it('offers whole-course and lesson Simple Learn without changing the main action', async () => {
    renderSheet('chem');
    fireEvent.click(screen.getByText('Practise until all correct'));
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Start practising' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/learn?mode=simple');
    fireEvent.change(screen.getByLabelText('What to practise'), { target: { value: 'l1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Start practising' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/lesson/l1/learn?mode=simple');
  });

  it('crossfades from the course picker to that course\'s options', async () => {
    renderSheet();
    expect(screen.getByRole('heading', { name: 'Which course?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chemistry' }));

    expect(screen.getByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Which course?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
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

  it('leaves Other ways to the course page that opened it', () => {
    mockFlows.chem.snapshot.recurringPracticeEligibleCount = 6;
    renderSheet('chem', { otherWays: false });
    expect(screen.queryByRole('region', { name: 'Other ways' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
  });

  it('closes when its handle is swiped down on a phone', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const onClose = vi.fn();
    renderSheet('chem', { onClose });
    const handle = screen.getByTestId('study-sheet-handle');
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 220, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
    matchMedia.mockRestore();
  });

  it('opens as a centred dialogue without a handle on wider screens', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('min-width'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    renderSheet('chem');
    // The shared centred panel, not a sheet pinned to the bottom edge.
    expect(screen.getByRole('dialog', { name: 'Choose what to study' })).toHaveClass('m-auto');
    expect(screen.queryByTestId('study-sheet-handle')).not.toBeInTheDocument();
    matchMedia.mockRestore();
  });
});
