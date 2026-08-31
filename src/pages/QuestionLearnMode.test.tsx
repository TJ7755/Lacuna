import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import { questionGeneratorRegistry } from '../questions/generators';
import type { QuestionAttempt, QuestionDefinition } from '../questions/types';
import { QuestionLearnMode } from './QuestionLearnMode';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  answer: vi.fn(),
  correction: vi.fn(),
  undo: vi.fn(),
  abandon: vi.fn(),
  notify: vi.fn(),
  data: undefined as CourseQuestionData | undefined,
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.data,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => ({ id: 'course-1', name: 'Mathematics' }),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock('../questions/repository', () => ({
  startQuestionAttempt: mocks.start,
  answerQuestionAttempt: mocks.answer,
  recordQuestionCorrection: mocks.correction,
  undoQuestionAttempt: mocks.undo,
  abandonQuestionAttempt: mocks.abandon,
}));

function question(): QuestionDefinition {
  return {
    id: 'question-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Addition application',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt: 'Solve **2 + 2**.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    explanation: 'Adding two and two gives **4**.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'revision-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: 1,
    scheduleEpoch: { id: 'epoch-1', startedAt: 1, reason: 'created', baseline: { kind: 'new' } },
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    scheduleUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function shownAttempt(input: { sessionId: string; attemptId: string }): QuestionAttempt {
  const definition = question();
  if (definition.kind !== 'fixed') throw new Error('Expected a fixed Question.');
  return {
    id: input.attemptId,
    questionId: definition.id,
    courseId: definition.courseId,
    contentVersion: 1,
    contentRevisionId: definition.contentRevisionId,
    scheduleEpochId: definition.scheduleEpoch.id,
    purpose: 'post-instruction',
    shownAt: 1,
    updatedAt: 1,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: definition.prompt,
    resolvedPayload: definition.payload,
    renderedExplanation: definition.explanation,
    scheduleEffect: { kind: 'none' },
    sessionId: input.sessionId,
  };
}

describe('QuestionLearnMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const definition = question();
    mocks.data = {
      questions: [definition],
      conceptSets: [
        {
          questionId: definition.id,
          courseId: definition.courseId,
          targetConceptIds: ['concept-1'],
          prerequisiteConceptIds: [],
          authoringRevisionId: definition.authoringRevisionId,
          authoringUpdatedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      concepts: [],
      attempts: [],
    };
    mocks.start.mockImplementation((input: { sessionId: string; attemptId: string }) =>
      Promise.resolve(shownAttempt(input)),
    );
    mocks.abandon.mockResolvedValue(undefined);
    mocks.answer.mockImplementation(
      (input: {
        attemptId: string;
        submittedAnswer: string | string[];
        marksEarned: number;
        marksAvailable: number;
      }) => {
        const started = shownAttempt({ sessionId: 'session', attemptId: input.attemptId });
        return Promise.resolve({
          recorded: true,
          question: question(),
          attempt: {
            ...started,
            status: 'answered',
            answeredAt: 2,
            submittedAnswer: input.submittedAnswer,
            marksEarned: input.marksEarned,
            marksAvailable: input.marksAvailable,
            grade: 3,
            scheduleEffect: { kind: 'replay', grade: 3 },
          },
        });
      },
    );
  });

  it('records a separate post-instruction Question attempt and reveals worked feedback', async () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/learn?mode=default&limit=10']}>
        <Routes>
          <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'question-1' }));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show worked feedback' }));

    await waitFor(() =>
      expect(mocks.answer).toHaveBeenCalledWith(
        expect.objectContaining({
          submittedAnswer: '4',
          marksEarned: 1,
          marksAvailable: 1,
        }),
      ),
    );
    expect(await screen.findByText('Full marks')).toBeInTheDocument();
    expect(screen.getByText(/Adding two and two gives/)).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('guards explicit Exit and browser unload only while a Question is outstanding', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/course/:courseId/questions/learn',
          element: <QuestionLearnMode />,
        },
        { path: '/course/:courseId/questions', element: <p>Question bank</p> },
      ],
      { initialEntries: ['/course/course-1/questions/learn'] },
    );
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(await screen.findByRole('dialog', { name: 'Leave this session?' })).toHaveTextContent(
      '0 of 1 Question answered',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(await screen.findByText('Question bank')).toBeInTheDocument();
    expect(mocks.abandon).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight answer before leaving and does not abandon the answered attempt', async () => {
    let resolveAnswer: ((result: Awaited<ReturnType<typeof mocks.answer>>) => void) | undefined;
    mocks.answer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    const router = createMemoryRouter(
      [
        { path: '/course/:courseId/questions/learn', element: <QuestionLearnMode /> },
        { path: '/course/:courseId/questions', element: <p>Question bank</p> },
      ],
      { initialEntries: ['/course/course-1/questions/learn'] },
    );
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show worked feedback' }));
    await waitFor(() => expect(mocks.answer).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.queryByText('Question bank')).not.toBeInTheDocument();
    expect(mocks.abandon).not.toHaveBeenCalled();

    const started = shownAttempt({
      sessionId: 'session',
      attemptId: mocks.answer.mock.calls[0][0].attemptId,
    });
    resolveAnswer!({
      recorded: true,
      question: question(),
      attempt: {
        ...started,
        status: 'answered',
        answeredAt: 2,
        submittedAnswer: '4',
        marksEarned: 1,
        marksAvailable: 1,
        grade: 3,
        scheduleEffect: { kind: 'replay', grade: 3 },
      },
    });

    expect(await screen.findByText('Question bank')).toBeInTheDocument();
    expect(mocks.abandon).not.toHaveBeenCalled();
  });

  it('blocks browser navigation, keeps typed work on Stay, then abandons once on Leave', async () => {
    function BrowserBack() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Browser back</button>;
    }

    const router = createMemoryRouter(
      [
        { path: '/previous', element: <p>Previous page</p> },
        {
          path: '/course/:courseId/questions/learn',
          element: (
            <>
              <BrowserBack />
              <QuestionLearnMode />
            </>
          ),
        },
      ],
      {
        initialEntries: ['/previous', '/course/course-1/questions/learn'],
        initialIndex: 1,
      },
    );
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));

    expect(await screen.findByRole('dialog', { name: 'Leave this session?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Your answer')).toHaveValue('4');
    expect(mocks.abandon).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Previous page')).toBeInTheDocument();
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith(expect.any(String)));
    expect(mocks.abandon).toHaveBeenCalledTimes(1);
  });

  it('abandons the active presentation when the page is hidden for unload', async () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/learn']}>
        <Routes>
          <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith(expect.any(String)));
  });

  it('abandons an attempt that finishes starting after the session unmounts', async () => {
    let resolveStart: ((attempt: QuestionAttempt) => void) | undefined;
    let startInput: { sessionId: string; attemptId: string } | undefined;
    mocks.start.mockImplementationOnce((input: { sessionId: string; attemptId: string }) => {
      startInput = input;
      return new Promise<QuestionAttempt>((resolve) => {
        resolveStart = resolve;
      });
    });

    const rendered = render(
      <MemoryRouter initialEntries={['/course/course-1/questions/learn']}>
        <Routes>
          <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(startInput).toBeDefined());
    rendered.unmount();
    resolveStart!(shownAttempt(startInput!));

    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith(startInput!.attemptId));
    expect(mocks.abandon).toHaveBeenCalledTimes(1);
  });

  it('offers inline retry and exit controls when a Question cannot start', async () => {
    mocks.start.mockRejectedValueOnce(new Error('The Question could not be loaded.'));

    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/learn']}>
        <Routes>
          <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
          <Route path="/course/:courseId/questions" element={<p>Question bank</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const recovery = await screen.findByRole('alert');
    expect(recovery).toHaveTextContent('The Question could not be loaded.');
    expect(within(recovery).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(recovery).getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);

    fireEvent.click(within(recovery).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Solve', { exact: false })).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('offers inline retry and exit controls when a generated Question cannot start', async () => {
    const generated: QuestionDefinition = {
      ...question(),
      kind: 'generated',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: {},
    };
    mocks.data = { ...mocks.data!, questions: [generated] };
    // Registry resolution throws synchronously, before startQuestionAttempt can even
    // return its promise, so the same recovery path must cover it.
    vi.spyOn(questionGeneratorRegistry, 'resolve').mockImplementationOnce(() => {
      throw new Error('This Question generator is not built into this client.');
    });

    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/learn']}>
        <Routes>
          <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
        </Routes>
      </MemoryRouter>,
    );

    const recovery = await screen.findByRole('alert');
    expect(recovery).toHaveTextContent('This Question generator is not built into this client.');
    expect(within(recovery).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(recovery).getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
});
