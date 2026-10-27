import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouterDom from 'react-router-dom';
import type { Card, Course } from '../../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import { prefetchRoute } from '../../routes/prefetch';
import { StudySheet } from './StudySheet';
import {
  LandingTransition,
  hasLandingArrival,
  releaseStudyCover,
} from '../layout/LandingTransition';

vi.mock('../../routes/prefetch', () => ({ prefetchRoute: vi.fn() }));

const mockNavigate = vi.fn();
const motionPreference = vi.hoisted(() => ({ multiplier: 0 }));
let mockCourses: Course[] = [];
const mockFlows: Record<
  string,
  {
    course: Course;
    snapshot: {
      recurringPracticeEligibleCount: number;
      examPracticeEligibleCount?: number;
      practiceByKey: Map<string, unknown>;
      assessmentOptions?: { assessmentId: string; name: string }[];
    };
    decision: { kind: 'step'; step: { kind: 'lesson'; lessonId: string; label: string } };
    lessonCardsById: Map<string, Card[]>;
    meanReviewSeconds: number;
  }
> = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../state/useLessonOrderData', () => ({
  useLessonOrderData: () => ({ lessons: [{ id: 'l1', name: 'Atomic structure' }] }),
}));

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
  speedMultiplier: () => motionPreference.multiplier,
  getMotionMultiplier: () => motionPreference.multiplier,
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
  const anchor =
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : document.createElement('button');
  if (!anchor.isConnected) {
    anchor.dataset.testAnchor = '';
    document.body.append(anchor);
  }
  return render(
    <StrictMode>
      <LazyMotion features={domAnimation}>
        <MemoryRouter>
          <LandingTransition />
          <StudySheet anchor={anchor} courseId={courseId} otherWays={otherWays} onClose={onClose} />
        </MemoryRouter>
      </LazyMotion>
    </StrictMode>,
  );
}

afterEach(() =>
  document.querySelectorAll('[data-test-anchor]').forEach((element) => element.remove()),
);

beforeEach(() => {
  motionPreference.multiplier = 0;
  mockNavigate.mockClear();
  vi.mocked(prefetchRoute).mockClear();
  mockCourses = [chemistry];
  mockFlows.chem = {
    course: chemistry,
    snapshot: { recurringPracticeEligibleCount: 0, practiceByKey: new Map() },
    decision: {
      kind: 'step',
      step: { kind: 'lesson', lessonId: 'l1', label: 'Atomic structure' },
    },
    lessonCardsById: new Map([['l1', [{ lastReviewed: 1 }, { lastReviewed: null }] as Card[]]]),
    meanReviewSeconds: 15,
  };
});

describe('StudySheet', () => {
  it('offers early exam practice separately from due reviews and the default plan', () => {
    mockFlows.chem.snapshot.examPracticeEligibleCount = 4;
    renderSheet('chem');
    fireEvent.click(screen.getByRole('button', { name: 'Other ways' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practise for exam' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/chem/study?review=exam');
  });
  it('expands the preview before navigating under the cover', async () => {
    motionPreference.multiplier = 1;
    renderSheet('chem');
    expect(prefetchRoute).toHaveBeenCalledWith('/course/chem/study');
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(hasLandingArrival()).toBe(true);
    expect(screen.getByTestId('study-cover')).toBeInTheDocument();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/course/chem/study'), {
      timeout: 2000,
    });
    releaseStudyCover();
  });

  it('starts instantly without a cover when motion is disabled', () => {
    renderSheet('chem');
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/chem/study');
    expect(hasLandingArrival()).toBe(false);
    expect(screen.queryByTestId('study-cover')).not.toBeInTheDocument();
  });

  it('previews only the next recommendation and keeps due review available in Other ways', () => {
    mockFlows.chem.snapshot.recurringPracticeEligibleCount = 6;
    renderSheet('chem');
    const steps = screen.getByRole('list', { name: "Today's session" });
    expect(steps).toHaveTextContent('Atomic structureLearn · 2 cards, 1 new');
    expect(steps).toHaveTextContent('2 cards, 1 new');
    expect(steps).not.toHaveTextContent('Review due cards');
    expect(steps.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(steps).not.toHaveTextContent('min');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    // One review plus a new card counted three times is a minute.
    expect(screen.getByText('About 1 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study');
    expect(
      screen.queryByRole('button', { name: /^Only review due cards/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Other ways' }));
    fireEvent.click(screen.getByRole('button', { name: /^Only review due cards/ }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study?review=due');
  });

  it('closes the preview without a duplicate Cancel action or starting study', () => {
    const onClose = vi.fn();
    renderSheet('chem', { onClose });
    expect(screen.getByRole('region', { name: 'Session preview' })).not.toHaveAttribute(
      'aria-modal',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close session preview' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('reveals named assessments on demand and keeps their study route', () => {
    mockFlows.chem.snapshot.assessmentOptions = [
      { assessmentId: 'exam/1', name: 'Chemistry checkpoint' },
    ];
    renderSheet('chem');
    const alternatives = screen.getByRole('button', { name: 'Other ways' });
    expect(alternatives).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Revise for Chemistry checkpoint' }),
    ).not.toBeInTheDocument();
    fireEvent.click(alternatives);
    expect(alternatives).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Revise for Chemistry checkpoint' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study?assessmentId=exam%2F1');
  });

  it('keeps an explicit close control above the session contents', () => {
    const onClose = vi.fn();
    renderSheet('chem', { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close session preview' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('focuses without scrolling the clipped expansion to reveal its heading', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderSheet('chem');
    const heading = screen.getByRole('heading', { name: 'Chemistry' });
    const headingCalls = focus.mock.calls.filter(
      (_, index) => focus.mock.contexts[index] === heading,
    );
    expect(headingCalls.length).toBeGreaterThan(0);
    expect(headingCalls.every(([options]) => options?.preventScroll === true)).toBe(true);
    focus.mockRestore();
  });

  it('focuses the preview heading and returns focus to its opener on dismissal', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Study';
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderSheet('chem');
    expect(screen.getByRole('heading', { name: 'Chemistry' })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('keeps Escape available without starting study', () => {
    const onClose = vi.fn();
    renderSheet('chem', { onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('starts due review when that is the first planned step', () => {
    Object.assign(mockFlows.chem, {
      decision: {
        kind: 'step',
        step: {
          kind: 'practice',
          mode: 'recurring',
          nodeKey: 'due-review',
          label: 'Review due cards',
        },
      },
    });
    mockFlows.chem.snapshot.recurringPracticeEligibleCount = 6;
    renderSheet('chem');
    expect(screen.getByText('About 3 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/study');
  });

  it('keeps optional practice out of the session preview', () => {
    renderSheet('chem');
    expect(screen.queryByText('Practise until all correct')).not.toBeInTheDocument();
  });

  it('offers whole-course and lesson practice inside Other ways', async () => {
    renderSheet('chem');
    fireEvent.click(screen.getByRole('button', { name: /^Other ways$/ }));
    const details = screen.getByText('Practise until all correct').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start practising' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/course/chem/learn?mode=simple');
    fireEvent.change(screen.getByLabelText('What to practise'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/lesson/l1/learn?mode=simple');
  });

  it('offers to add cards when the course is empty', () => {
    Object.assign(mockFlows.chem, { decision: { kind: 'empty' } });
    renderSheet('chem');
    fireEvent.click(screen.getByRole('button', { name: 'Add cards' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/chem/cards/new');
  });

  it('does not offer to add cards to a locked copy', () => {
    Object.assign(mockFlows.chem, {
      course: { ...chemistry, distributedCopy: { locked: true } },
      decision: { kind: 'empty' },
    });
    renderSheet('chem');
    expect(screen.getByText('This course has no cards yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add cards' })).not.toBeInTheDocument();
  });

  it('names the locked lesson and what unlocks it', () => {
    Object.assign(mockFlows.chem, {
      course: { ...chemistry, unlockMode: 'semi-linear' },
      decision: { kind: 'blocked', reason: 'curriculum-locked' },
      snapshot: {
        ...mockFlows.chem.snapshot,
        nodes: [
          {
            id: 'l1',
            nodeType: 'lesson',
            status: 'completed',
            lesson: { id: 'l1', name: 'Atoms', orderIndex: 0 },
          },
          {
            id: 'l2',
            nodeType: 'lesson',
            status: 'locked',
            lesson: { id: 'l2', name: 'Bonding', orderIndex: 1 },
          },
        ],
      },
    });
    renderSheet('chem');
    expect(
      screen.getByText(/is locked\. Unlocks once the lesson before it is complete\./),
    ).toHaveTextContent('Bonding is locked.');
  });

  it('says an archived course must be restored rather than calling it locked', () => {
    Object.assign(mockFlows.chem, { decision: { kind: 'blocked', reason: 'archived' } });
    renderSheet('chem');
    expect(screen.getByText('This course is archived. Restore it to study.')).toBeInTheDocument();
  });

  it("crossfades from the course picker to that course's options", async () => {
    renderSheet();
    expect(screen.getByRole('heading', { name: 'Which course?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chemistry' }));

    expect(screen.getByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Which course?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chemistry' })).toHaveFocus());
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
});
