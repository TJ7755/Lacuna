import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { QuestionsPage } from './QuestionsPage';

const mocks = vi.hoisted(() => ({
  data: undefined as
    | {
        sets: Array<{
          id: string;
          courseId: string;
          title: string;
          lessonIds: string[];
          assessmentIds: string[];
          questions: never[];
        }>;
        drafts: never[];
        legacy: number;
        attemptsBySet: Map<string, unknown[]>;
        error: string;
      }
    | undefined,
}));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => mocks.data }));
vi.mock('../db/schema', () => ({ db: {}, makeId: () => 'new-id' }));
vi.mock('../state/useCourseData', () => ({
  useCourse: (courseId: string) => ({
    id: courseId,
    name: courseId === 'course-1' ? 'Biology' : 'Chemistry',
    archived: false,
  }),
}));
vi.mock('../course/lessonViewMode', () => ({ resolveLessonViewMode: () => 'read' }));
vi.mock('../components/question-sets/RemovedQuestionSetAttempts', () => ({
  RemovedQuestionSetAttempts: () => null,
}));
vi.mock('../questions/questionSetDrafts', () => ({
  createEmptyQuestionSetDraft: vi.fn(),
  listQuestionSetDrafts: vi.fn(),
  saveQuestionSetDraft: vi.fn(),
}));
vi.mock('../questions/questionSetRepository', () => ({ listQuestionSets: vi.fn() }));
const startAttempt = vi.hoisted(() => vi.fn());
vi.mock('../questions/questionSetAttemptRepository', () => ({
  startQuestionSetAttempt: startAttempt,
}));
vi.mock('../questions/questionSetProgress', () => ({
  questionSetProgress: (attempts: Array<{ score: number }>) => ({
    history: attempts.map((attempt) => attempt.score),
    latest: attempts.at(-1)?.score,
    lastTriedAt: Date.now() - 3 * 86_400_000,
  }),
}));

function Location() {
  const location = useLocation();
  return <output aria-label="Current location">{location.pathname + location.search}</output>;
}

function SetPage() {
  const { setId } = useParams();
  const location = useLocation();
  const origin = location.state as
    | { questionSetReturnTo?: string; questionSetReturnLabel?: string }
    | undefined;
  return (
    <div>
      <p>Set: {setId}</p>
      <output aria-label="Return state">{JSON.stringify(origin)}</output>
      <Link to={origin?.questionSetReturnTo ?? '/course/course-1/questions'}>Back to Questions</Link>
    </div>
  );
}

function renderLibrary(path = '/course/course-1/questions') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <main>
        <Location />
        <Routes>
          <Route path="/course/:courseId/questions" element={<QuestionsPage />} />
          <Route path="/course/:courseId/question-sets/:setId" element={<SetPage />} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

describe('QuestionsPage navigation', () => {
  it('reflects search in the URL, filters sets, and returns from a set to the same search', async () => {
    mocks.data = {
      sets: [
        {
          id: 'set-kinetics',
          courseId: 'course-1',
          title: 'Kinetics questions',
          lessonIds: [],
          assessmentIds: [],
          questions: [],
        },
        {
          id: 'set-cells',
          courseId: 'course-1',
          title: 'Cell structure',
          lessonIds: [],
          assessmentIds: [],
          questions: [],
        },
      ],
      drafts: [],
      legacy: 0,
      attemptsBySet: new Map(),
      error: '',
    };
    renderLibrary();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sets' }), {
      target: { value: 'kinetics' },
    });

    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/course/course-1/questions?q=kinetics',
    );
    expect(screen.getByRole('heading', { name: 'Kinetics questions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cell structure' })).not.toBeInTheDocument();

    const main = screen.getByRole('main');
    main.scrollTop = 320;
    fireEvent.scroll(main);
    fireEvent.click(screen.getByRole('link', { name: /Kinetics questions/ }));
    expect(await screen.findByText('Set: set-kinetics')).toBeInTheDocument();
    main.scrollTop = 0;
    expect(screen.getByLabelText('Return state')).toHaveTextContent(
      JSON.stringify({
        questionSetReturnTo: '/course/course-1/questions?q=kinetics',
        questionSetReturnLabel: 'Back to Questions',
      }),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Back to Questions' }));

    expect(await screen.findByRole('searchbox', { name: 'Search sets' })).toHaveValue('kinetics');
    await waitFor(() => expect(main.scrollTop).toBe(320));
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/course/course-1/questions?q=kinetics',
    );
    expect(screen.getByRole('heading', { name: 'Kinetics questions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cell structure' })).not.toBeInTheDocument();
  });

  it('keeps library searches scoped to the course in the URL', async () => {
    mocks.data = {
      sets: [
        {
          id: 'set-one',
          courseId: 'course-1',
          title: 'Kinetics',
          lessonIds: [],
          assessmentIds: [],
          questions: [],
        },
      ],
      drafts: [],
      legacy: 0,
      attemptsBySet: new Map(),
      error: '',
    };
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions?q=kinetics']}>
        <main>
          <Location />
          <Link to="/course/course-2/questions">Other course</Link>
          <Routes>
            <Route path="/course/:courseId/questions" element={<QuestionsPage />} />
          </Routes>
        </main>
      </MemoryRouter>,
    );

    expect(screen.getByRole('searchbox', { name: 'Search sets' })).toHaveValue('kinetics');
    fireEvent.click(screen.getByRole('link', { name: 'Other course' }));

    expect(await screen.findByRole('searchbox', { name: 'Search sets' })).toHaveValue('');
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/course/course-2/questions');
  });

  it('scores each set and starts a Practice attempt from the list', async () => {
    startAttempt.mockResolvedValue({ id: 'attempt-9' });
    mocks.data = {
      sets: [
        { id: 'set-cells', courseId: 'course-1', title: 'Cell structure', lessonIds: [], assessmentIds: [], questions: [] },
        { id: 'set-new', courseId: 'course-1', title: 'Osmosis', lessonIds: [], assessmentIds: [], questions: [] },
      ],
      drafts: [],
      legacy: 0,
      attemptsBySet: new Map([['set-cells', [{ score: 48 }, { score: 72 }]]]),
      error: '',
    };
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions']}>
        <Location />
        <Routes>
          <Route path="/course/:courseId/questions" element={<QuestionsPage />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: 'Latest score 72%. Recent scores: 48%, 72%' })).toBeInTheDocument();
    expect(screen.getByText(/last tried 3 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/not tried yet/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Attempt' })[1]);
    expect(startAttempt).toHaveBeenCalledWith('set-new', 'practice');
    await waitFor(() =>
      expect(screen.getByLabelText('Current location')).toHaveTextContent(
        '/course/course-1/question-sets/set-new/attempts/attempt-9',
      ),
    );
  });
});
