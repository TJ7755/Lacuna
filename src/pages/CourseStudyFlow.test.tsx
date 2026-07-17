import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type { Course } from '../db/types';
import type { SessionSummary } from '../components/learn/types';
import type { StudyFlowStep } from '../course/studyFlowPlanner';
import type { CourseStudyFlowSnapshot, StudyFlowPracticeState } from '../course/studyFlowSnapshot';
import type { AssessmentPracticeOption } from '../course/assessmentPractice';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import type { useCourseStudyFlow } from '../state/useCourseStudyFlow';
import { CourseStudyFlow } from './CourseStudyFlow';

type FlowData = NonNullable<ReturnType<typeof useCourseStudyFlow>>;

const mockNavigate = vi.fn();
const mockAcceptBreak = vi.fn();
const mockDeferBreak = vi.fn();
let mockFlows: FlowData[] = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../state/useCourseStudyFlow', () => ({
  useCourseStudyFlow: (_courseId: string | undefined, refreshKey = 0) => mockFlows[refreshKey],
}));

vi.mock('../hooks/PomodoroContext', () => ({
  PomodoroProvider: ({ children }: { children: React.ReactNode }) => children,
  usePomodoroContext: () => ({
    breakPending: false,
    acceptBreak: mockAcceptBreak,
    deferBreak: mockDeferBreak,
  }),
}));

vi.mock('../components/learn/PomodoroTimer', () => ({
  PomodoroTimer: () => <div data-testid="pomodoro" />,
}));

vi.mock('./LearnMode', () => ({
  LearnMode: ({
    request,
    onStepFinished,
    onFlowExit,
    sessionId,
  }: {
    request: unknown;
    onStepFinished: (summary: SessionSummary) => void;
    onFlowExit: () => void;
    sessionId?: string;
  }) => (
    <div>
      <pre data-testid="learn-request">{JSON.stringify(request)}</pre>
      <span data-testid="learn-session">{sessionId}</span>
      <button type="button" onClick={() => onStepFinished(summary(true))}>
        Complete step
      </button>
      <button type="button" onClick={() => onStepFinished(summary(false))}>
        Pause step
      </button>
      <button type="button" onClick={onFlowExit}>
        Exit flow
      </button>
    </div>
  ),
}));

const course: Course = {
  id: 'course-1',
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

function summary(reachedGoal: boolean): SessionSummary {
  return {
    events: [],
    masteryBefore: 0,
    masteryAfter: reachedGoal ? 1 : 0.5,
    objectiveLabel: 'Readiness',
    focusFraction: 1,
    reachedGoal,
    limitReached: false,
  };
}

function practiceState(
  nodeKey: string,
  label: string,
  scopeLessonIds: string[] = [],
): StudyFlowPracticeState {
  return {
    nodeKey,
    nodeType: 'practice-manual',
    label,
    scopeLessonIds: new Set(scopeLessonIds),
    sessionScopeLessonIds: new Set(scopeLessonIds),
    assessmentOptions: [],
    scopeVersion: 'scope-1',
    totalCount: 2,
    securedCount: 0,
    eligibleCount: 2,
    completed: false,
    active: true,
  };
}

function snapshot(
  practices: StudyFlowPracticeState[] = [],
  assessmentOptions: AssessmentPracticeOption[] = [],
): CourseStudyFlowSnapshot {
  return {
    courseId: course.id,
    archived: false,
    nodes: [],
    practiceByKey: new Map(practices.map((practice) => [practice.nodeKey, practice])),
    activeManualNodeKeys: new Set(),
    completedManualNodeKeys: new Set(),
    recurringPracticeEligibleCount: 0,
    assessmentOptions,
  };
}

function flow(
  step: StudyFlowStep,
  generation: number,
  practices: StudyFlowPracticeState[] = [],
): FlowData {
  return {
    course,
    snapshot: snapshot(practices),
    decision: { kind: 'step', step },
    generation,
  };
}

function choiceFlow(
  step: StudyFlowStep,
  generation: number,
  assessments: AssessmentPracticeOption[],
): FlowData {
  return {
    course,
    snapshot: snapshot([], assessments),
    decision: { kind: 'choice', step, assessments },
    generation,
  };
}

function renderFlow(entry = '/course/course-1/study') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/course/:courseId/study" element={<CourseStudyFlow />} />
      </Routes>
    </MemoryRouter>,
  );
}

function request(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('learn-request').textContent ?? '{}') as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
  mockAcceptBreak.mockClear();
  mockDeferBreak.mockClear();
  mockFlows = [];
});

describe('CourseStudyFlow', () => {
  it('renders the initial lesson as an embedded LearnMode request', async () => {
    mockFlows = [flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0)];

    renderFlow();

    await screen.findByTestId('learn-request');
    expect(request()).toEqual({ kind: 'lesson', lessonId: 'lesson-1' });
  });

  it('replans after a completed step and continues without leaving the conductor', async () => {
    const nextPractice = practiceState('auto-1', 'Practice', ['lesson-1']);
    mockFlows = [
      flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0),
      flow({ kind: 'practice', nodeKey: 'auto-1', mode: 'curricular', label: 'Practice' }, 1, [
        nextPractice,
      ]),
    ];
    renderFlow();
    await screen.findByTestId('learn-request');

    fireEvent.click(screen.getByRole('button', { name: 'Complete step' }));
    expect(await screen.findByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Practice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() =>
      expect(request()).toEqual({
        kind: 'practice',
        courseId: 'course-1',
        nodeKey: 'auto-1',
        scopeLessonIds: ['lesson-1'],
        mode: 'curricular',
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('resumes the same step when the embedded session is incomplete', async () => {
    mockFlows = [
      flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0),
      flow({ kind: 'lesson', lessonId: 'lesson-2', label: 'Bonding' }, 1),
    ];
    renderFlow();
    await screen.findByTestId('learn-request');

    fireEvent.click(screen.getByRole('button', { name: 'Pause step' }));
    expect(await screen.findByText('Step paused')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(request()).toEqual({ kind: 'lesson', lessonId: 'lesson-1' }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('starts a course-wide ad-hoc Practice request from the due-review query', async () => {
    mockFlows = [flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0)];
    renderFlow('/course/course-1/study?review=due');

    await screen.findByTestId('learn-request');
    expect(request()).toEqual({
      kind: 'practice',
      courseId: 'course-1',
      mode: 'ad-hoc',
    });
  });

  it('starts exact-assessment Practice from the assessment query', async () => {
    mockFlows = [flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0)];
    renderFlow('/course/course-1/study?assessmentId=paper-1');

    await screen.findByTestId('learn-request');
    expect(request()).toEqual({
      kind: 'practice',
      courseId: 'course-1',
      mode: 'assessment',
      assessmentId: 'paper-1',
    });
  });

  it('shows an explicit Study Now choice and preserves the curriculum branch', async () => {
    const option = {
      assessmentId: 'paper-1',
      name: 'Paper 1',
      examDate: Date.now() + 86_400_000,
      eligibleCount: 2,
    };
    const lessonStep: StudyFlowStep = {
      kind: 'lesson',
      lessonId: 'lesson-1',
      label: 'Atomic structure',
    };
    mockFlows = [choiceFlow(lessonStep, 0, [option])];
    renderFlow();

    expect(await screen.findByRole('heading', { name: 'Continue or revise' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue: Atomic structure' }));
    await waitFor(() => expect(request()).toEqual({ kind: 'lesson', lessonId: 'lesson-1' }));
  });

  it('starts the chosen assessment branch and does not retain it as a preference', async () => {
    const option = {
      assessmentId: 'paper-1',
      name: 'Paper 1',
      examDate: Date.now() + 86_400_000,
      eligibleCount: 2,
    };
    const firstLesson: StudyFlowStep = {
      kind: 'lesson',
      lessonId: 'lesson-1',
      label: 'Atomic structure',
    };
    const secondLesson: StudyFlowStep = {
      kind: 'lesson',
      lessonId: 'lesson-2',
      label: 'Bonding',
    };
    mockFlows = [choiceFlow(firstLesson, 0, [option]), choiceFlow(secondLesson, 1, [option])];
    renderFlow();

    fireEvent.click(await screen.findByRole('button', { name: /Revise for Paper 1/ }));
    await waitFor(() =>
      expect(request()).toEqual({
        kind: 'practice',
        courseId: 'course-1',
        mode: 'assessment',
        assessmentId: 'paper-1',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete step' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/ }));

    expect(await screen.findByRole('heading', { name: 'Continue or revise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue: Bonding' })).toBeInTheDocument();
  });

  it('clears the active flow and returns to the course when finished', async () => {
    mockFlows = [
      flow({ kind: 'lesson', lessonId: 'lesson-1', label: 'Atomic structure' }, 0),
      flow({ kind: 'lesson', lessonId: 'lesson-2', label: 'Bonding' }, 1),
    ];
    renderFlow();
    await screen.findByTestId('learn-request');
    await waitFor(() => expect(localStorage.getItem('lacuna.activeStudyFlow')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Complete step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish for now' }));

    expect(localStorage.getItem('lacuna.activeStudyFlow')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1');
  });

  it('moves through a manual Practice transition without leaving the conductor', async () => {
    const manual = practiceState('manual-1', 'Checkpoint', ['lesson-1']);
    mockFlows = [
      flow({ kind: 'practice', nodeKey: 'manual-1', mode: 'curricular', label: 'Checkpoint' }, 0, [
        manual,
      ]),
      flow({ kind: 'lesson', lessonId: 'lesson-2', label: 'Bonding' }, 1),
    ];
    renderFlow();
    await screen.findByTestId('learn-request');
    expect(request()).toMatchObject({ kind: 'practice', nodeKey: 'manual-1' });
    const sessionId = screen.getByTestId('learn-session').textContent;
    expect(sessionId).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Complete step' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/ }));

    await waitFor(() => expect(request()).toEqual({ kind: 'lesson', lessonId: 'lesson-2' }));
    expect(screen.getByTestId('learn-session')).toHaveTextContent(sessionId!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
