import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type * as Router from 'react-router-dom';
import type * as CardImport from '../../db/cardImport';
import { MemoryRouter } from 'react-router-dom';
import { ImportPanel } from './ImportPanel';
import { domAnimation, LazyMotion } from 'motion/react';
import { libraryCourses } from '../../library/catalogue';

const mocks = vi.hoisted(() => ({
  multiplier: 0,
  navigate: vi.fn(),
  notify: vi.fn(),
  importCards: vi.fn(),
  parseApkg: vi.fn(),
  decodeFile: vi.fn(),
  importShare: vi.fn(),
  shareLink: vi.fn(),
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof Router>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => mocks.multiplier,
}));
vi.mock('../../state/useCourseData', () => ({
  useCourses: () => [{ id: 'french', name: 'French' }],
  useLessons: () => [{ id: 'greetings', name: 'Greetings' }],
}));
vi.mock('../../db/cardImport', async (original) => ({
  ...(await original<typeof CardImport>()),
  importCardsToDestination: mocks.importCards,
}));
vi.mock('../../db/cardRepository', () => ({
  checkDuplicatesBatch: () => Promise.resolve(new Set()),
}));
vi.mock('../../db/apkgImport', () => ({ parseApkg: mocks.parseApkg }));
vi.mock('../../db/courseFile', () => ({
  decodeCourseFile: mocks.decodeFile,
  MAX_COURSE_FILE_BYTES: 100_000_000,
  withCourseFileAssets: (_file: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock('../../db/share', () => ({
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
vi.mock('../../db/mergeImport', () => ({ isLineagePayload: () => false }));
vi.mock('./ShareLinkImport', () => ({
  ShareLinkImport: (props: {
    code: string;
    chosen?: boolean;
    isCurrent: () => boolean;
    onBusyChange?: (busy: boolean) => void;
    onOpenCourse: (id: string) => void;
  }) => {
    mocks.shareLink(props);
    return <p>Importing {props.code}</p>;
  },
}));
vi.mock('../cards/CardContent', () => ({
  CardContent: ({ card, side }: { card: Record<string, string>; side: string }) => (
    <div>{card[side]}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.multiplier = 0;
  mocks.importCards.mockResolvedValue({
    count: 1,
    courseId: 'new-course',
    lesson: { id: 'new-lesson' },
  });
});
function open(entry = '/') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ImportPanel />
    </MemoryRouter>,
  );
}
it('leads with the course library and imports a chosen course inside the panel', async () => {
  open();
  const library = screen.getByRole('button', { name: /Course library/ });
  expect(library).toHaveFocus();
  expect(library).toHaveAttribute('data-featured', 'true');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(library);

  const search = screen.getByRole('searchbox', { name: 'Search the course library' });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: 'aqa biology' } });
  const course = libraryCourses.find((entry) => entry.id === 'biology8461')!;
  const matches = screen.getAllByRole('button', { name: /^Biology/ });
  expect(matches).toHaveLength(1);
  fireEvent.click(matches[0]);

  expect(mocks.shareLink).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: course.shareUrl, chosen: true }),
  );
  const { isCurrent, onOpenCourse } = mocks.shareLink.mock.lastCall![0];
  expect(isCurrent()).toBe(true);
  onOpenCourse('biology');
  expect(mocks.navigate).toHaveBeenCalledWith('/course/biology');

  const back = screen.getByRole('button', { name: 'Back to the course library' });
  await waitFor(() => expect(back).toHaveFocus());
  fireEvent.click(back);
  expect(isCurrent()).toBe(false);
  expect(screen.getByRole('searchbox', { name: 'Search the course library' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Back to import sources' }));
  expect(screen.getByRole('button', { name: /Course library/ })).toHaveFocus();
});

it('holds the way back during a library import and ignores an earlier choice afterwards', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Course library/ }));
  const search = screen.getByRole('searchbox', { name: 'Search the course library' });
  fireEvent.change(search, { target: { value: '8461' } });
  fireEvent.click(screen.getByRole('button', { name: /^Biology/ }));
  const first = mocks.shareLink.mock.lastCall![0];

  act(() => {
    first.onBusyChange(true);
  });
  const back = screen.getByRole('button', { name: 'Back to the course library' });
  expect(back).toBeDisabled();
  fireEvent.keyDown(back, { key: 'Escape' });
  expect(screen.getByText(/^Importing/)).toBeInTheDocument();
  act(() => {
    first.onBusyChange(false);
  });

  fireEvent.click(back);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search the course library' }), {
    target: { value: '8461' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Biology/ }));
  // The same course chosen again is a new import; the first one is stale.
  expect(first.isCurrent()).toBe(false);
  expect(mocks.shareLink.mock.lastCall![0].isCurrent()).toBe(true);
});

it('tells the learner when no library course matches', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Course library/ }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search the course library' }), {
    target: { value: 'astrophysics' },
  });
  expect(screen.getByRole('status')).toHaveTextContent('No library course matches');
});
async function reviewText(reverse = false) {
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  fireEvent.change(screen.getByLabelText('Paste your cards'), {
    target: { value: 'bonjour\thello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  expect(await screen.findByRole('button', { name: 'Choose destination' })).toBeEnabled();
  expect(screen.queryByLabelText('Course title')).not.toBeInTheDocument();
  if (reverse) fireEvent.click(screen.getByRole('switch', { name: 'Also create reverse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose destination' }));
  await screen.findByLabelText('Course title');
}

it('reviews before asking for a destination, retaining the draft on Undo and failure', async () => {
  open();
  await reviewText(true);
  expect(screen.getByRole('button', { name: 'Import 2 cards' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'French basics' } });
  expect(screen.getByRole('radio', { name: /Steady retention/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByRole('button', { name: 'Choose destination' })).toBeEnabled();
  expect(screen.queryByLabelText('Course title')).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Also create reverse' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
  expect(mocks.importCards).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  expect(await screen.findByRole('switch', { name: 'Also create reverse' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Choose destination' }));
  expect(await screen.findByLabelText('Course title')).toHaveValue('French basics');
  mocks.importCards.mockRejectedValueOnce(new Error('Storage full'));
  fireEvent.click(screen.getByRole('button', { name: 'Import 2 cards' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage full');
  expect(screen.getByLabelText('Course title')).toHaveValue('French basics');
  fireEvent.click(screen.getByRole('button', { name: 'Import 2 cards' }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith('/course/new-course/lesson/new-lesson'),
  );
  expect(mocks.importCards).toHaveBeenCalledWith(
    { kind: 'course', title: 'French basics', options: { schedulingMode: 'steady' } },
    expect.objectContaining({ kind: 'text', reverse: true }),
  );
});

it('imports into an existing lesson without asking for a new study target', async () => {
  open();
  await reviewText();
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'french' } });
  fireEvent.change(screen.getByLabelText('Lesson'), { target: { value: 'greetings' } });
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));
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
  expect(mocks.importShare).toHaveBeenCalledWith(file.payload, undefined);
});

it('creates a lesson in an existing course with the imported cards', async () => {
  open();
  await reviewText();
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'french' } });
  fireEvent.change(screen.getByLabelText('Lesson title'), { target: { value: 'Verbs' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Choose destination' }));
  fireEvent.change(await screen.findByLabelText('Course title'), {
    target: { value: 'French exam' },
  });
  fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
  expect(screen.getByRole('button', { name: 'Exam date and time' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));
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

it('keeps the import chooser free of redundant course navigation', () => {
  open();
  expect(screen.queryByRole('link', { name: 'All courses' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back to import sources' })).not.toBeInTheDocument();
});

it.each(['Lacuna course', 'Anki deck', 'Text or spreadsheet'])(
  'returns from %s to the import chooser with Back without writing',
  async (source) => {
    open();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(source) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to import sources' }));
    expect(screen.getByText('Drop a file here')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back to import sources' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(source) })).toHaveFocus();
    expect(mocks.importCards).not.toHaveBeenCalled();
    expect(mocks.importShare).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  },
);

it('is keyboard-first: focuses the paste field, Tab reaches the primary action, Ctrl+Enter continues', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  const paste = screen.getByLabelText('Paste your cards');
  await waitFor(() => expect(paste).toHaveFocus());
  fireEvent.change(paste, { target: { value: 'bonjour\thello' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review cards' })).toBeEnabled());
  fireEvent.keyDown(paste, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Review cards' })).toHaveFocus();
  fireEvent.keyDown(paste, { key: 'Enter', ctrlKey: true });
  expect(await screen.findByRole('button', { name: 'Choose destination' })).toBeEnabled();
  expect(screen.queryByLabelText('Course title')).not.toBeInTheDocument();
});

it('Escape returns to the source list only while nothing has been typed', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  const paste = screen.getByLabelText('Paste your cards');
  fireEvent.input(paste, { target: { value: 'x' } });
  fireEvent.keyDown(paste, { key: 'Escape' });
  expect(screen.getByLabelText('Paste your cards')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to import sources' }));
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  fireEvent.keyDown(screen.getByLabelText('Paste your cards'), { key: 'Escape' });
  expect(screen.getByRole('button', { name: /Text or spreadsheet/ })).toBeInTheDocument();
});

it('keeps pasted text after going back to All sources and returning', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  fireEvent.change(screen.getByLabelText('Paste your cards'), {
    target: { value: 'bonjour\thello\nmerci\tthanks' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to import sources' }));
  await waitFor(() => expect(screen.queryByLabelText('Paste your cards')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Text or spreadsheet/ }));
  expect(screen.getByLabelText('Paste your cards')).toHaveValue('bonjour\thello\nmerci\tthanks');
});

it('keeps All sources in the departing form until its transition finishes', async () => {
  mocks.multiplier = 1;
  render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <ImportPanel />
      </MemoryRouter>
    </LazyMotion>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Lacuna course/ }));
  const back = screen.getByRole('button', { name: 'Back to import sources' });
  fireEvent.click(back);
  expect(back).toBeInTheDocument();
  expect(back.closest('[inert]')).not.toBeNull();
  expect(back.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: /Lacuna course/ })).toHaveFocus();
  await waitFor(() => expect(back).not.toBeInTheDocument());
});

it('offers class joining in the import sources and focuses the code field', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /Join a class/ }));
  expect(screen.getByLabelText('Class code')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Back to import sources' }));
  expect(screen.getByRole('button', { name: /Join a class/ })).toHaveFocus();
});
it('opens class entry directly from Today and routes a formatted code to the existing invitation', () => {
  open('/?import=1&join=1');
  const field = screen.getByLabelText('Class code');
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: ' k7qm - 4xtp ' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Join a class' }));
  expect(mocks.navigate).toHaveBeenCalledWith('/s/K7QM4XTP');
});
it('keeps malformed codes in the form with actionable feedback', () => {
  open('/?import=1&join=1');
  fireEvent.change(screen.getByLabelText('Class code'), { target: { value: 'short' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Join a class' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter the eight-character class code from your teacher.',
  );
  expect(screen.getByRole('textbox', { name: /Class code/ })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});
