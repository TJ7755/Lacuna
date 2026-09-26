import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type * as Router from 'react-router-dom';
import type * as CardImport from '../db/cardImport';
import { MemoryRouter } from 'react-router-dom';
import { ImportPage } from './ImportPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notify: vi.fn(),
  importCards: vi.fn(),
  parseApkg: vi.fn(),
  decodeFile: vi.fn(),
  importShare: vi.fn(),
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof Router>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
vi.mock('../state/useCourseData', () => ({
  useCourses: () => [{ id: 'french', name: 'French' }],
  useLessons: () => [{ id: 'greetings', name: 'Greetings' }],
}));
vi.mock('../db/cardImport', async (original) => ({
  ...(await original<typeof CardImport>()),
  importCardsToDestination: mocks.importCards,
}));
vi.mock('../db/cardRepository', () => ({ checkDuplicatesBatch: () => Promise.resolve(new Set()) }));
vi.mock('../db/apkgImport', () => ({ parseApkg: mocks.parseApkg }));
vi.mock('../db/courseFile', () => ({
  decodeCourseFile: mocks.decodeFile,
  MAX_COURSE_FILE_BYTES: 100_000_000,
  withCourseFileAssets: (_file: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock('../db/share', () => ({
  decodeShare: vi.fn(),
  summariseShare: () => ({
    kind: 'course',
    courseName: 'Shared biology',
    lessonCount: 1,
    cardCount: 2,
    deckNames: [],
    exportedAt: Date.now(),
  }),
  importSharePayload: mocks.importShare,
}));
vi.mock('../db/mergeImport', () => ({ isLineagePayload: () => false }));
vi.mock('../components/cards/CardContent', () => ({
  CardContent: ({ card, side }: { card: Record<string, string>; side: string }) => (
    <div>{card[side]}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.importCards.mockResolvedValue({
    count: 1,
    courseId: 'new-course',
    lesson: { id: 'new-lesson' },
  });
});
function open() {
  render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  );
}
async function reviewText() {
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  fireEvent.change(screen.getByLabelText('Paste your cards'), {
    target: { value: 'bonjour\thello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  await screen.findByLabelText('Course title');
}

it('reviews before asking for a destination, retaining the draft on Undo and failure', async () => {
  open();
  await reviewText();
  expect(screen.getByRole('button', { name: 'Import 1 cards' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'French basics' } });
  fireEvent.click(screen.getByRole('radio', { name: /Steady retention/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
  expect(mocks.importCards).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  expect(await screen.findByLabelText('Course title')).toHaveValue('French basics');
  mocks.importCards.mockRejectedValueOnce(new Error('Storage full'));
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage full');
  expect(screen.getByLabelText('Course title')).toHaveValue('French basics');
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith('/course/new-course/lesson/new-lesson'),
  );
  expect(mocks.importCards).toHaveBeenCalledWith(
    { kind: 'course', title: 'French basics', options: { schedulingMode: 'steady' } },
    expect.objectContaining({ kind: 'text', reverse: false }),
  );
});

it('imports into an existing lesson without asking for a new study target', async () => {
  open();
  await reviewText();
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'french' } });
  fireEvent.change(screen.getByLabelText('Lesson'), { target: { value: 'greetings' } });
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
  await waitFor(() =>
    expect(mocks.importCards).toHaveBeenCalledWith(
      { kind: 'existing', schedulingUnitId: 'greetings' },
      expect.anything(),
    ),
  );
});

it('detects a dropped Anki package and previews it without writing', async () => {
  mocks.parseApkg.mockResolvedValue({
    cards: [{ front: 'bonjour', back: 'hello', type: 'front_back' }],
    media: new Map(),
    skippedCards: 0,
  });
  open();
  fireEvent.drop(screen.getByText('Drop a file here').parentElement!, {
    dataTransfer: { files: [new File(['anki'], 'French.apkg')] },
  });
  expect(await screen.findByText('French.apkg')).toBeInTheDocument();
  expect(mocks.parseApkg).toHaveBeenCalledWith(expect.any(File), { importScheduling: true });
  expect(mocks.importCards).not.toHaveBeenCalled();
});

it('detects a course file, previews it and opens its course only after confirmation', async () => {
  const file = { payload: { v: 2 }, assets: [] };
  mocks.decodeFile.mockResolvedValue(file);
  mocks.importShare.mockResolvedValue({ courses: 1, cards: 2, courseIds: ['biology'] });
  open();
  fireEvent.change(screen.getByLabelText('Import file'), {
    target: { files: [new File(['course'], 'Biology.lacuna')] },
  });
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
  expect(mocks.importShare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/course/biology'));
  expect(mocks.importShare).toHaveBeenCalledWith(file.payload);
});

it('creates a lesson in an existing course with the imported cards', async () => {
  open();
  await reviewText();
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'french' } });
  fireEvent.change(screen.getByLabelText('Lesson title'), { target: { value: 'Verbs' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
  await waitFor(() =>
    expect(mocks.importCards).toHaveBeenCalledWith(
      { kind: 'lesson', courseId: 'french', title: 'Verbs' },
      expect.anything(),
    ),
  );
});

it('reads a text file before configuring a new course with an exam target', async () => {
  open();
  fireEvent.change(screen.getByLabelText('Import file'), {
    target: { files: [new File(['bonjour\thello'], 'French.tsv')] },
  });
  expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  fireEvent.change(await screen.findByLabelText('Course title'), {
    target: { value: 'French exam' },
  });
  fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
  expect(screen.getByRole('button', { name: 'Exam date and time' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
  await waitFor(() =>
    expect(mocks.importCards).toHaveBeenCalledWith(
      {
        kind: 'course',
        title: 'French exam',
        options: {
          schedulingMode: 'exam',
          examDate: expect.any(Number),
          timeZone: expect.any(String),
        },
      },
      expect.anything(),
    ),
  );
});
