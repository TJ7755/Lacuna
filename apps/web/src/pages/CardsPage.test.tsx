import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CardsPage } from './CardsPage';
import type {
  Card,
  Course,
  LegacyDeckRecord,
  Lesson,
  Occlusion,
  Sequence,
} from '@lacuna/core/db/types';

vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));

let mockCourse: Course | undefined;
let mockLessons: Lesson[] | undefined;
vi.mock('../state/useLessonOrderData', () => ({
  useLessonOrderData: () => ({ lessons: mockLessons }),
}));
let mockCards: Card[] | undefined;
let mockSequences: Sequence[] | undefined = [];
let mockOcclusions: Occlusion[] | undefined = [];
let observedContexts: {
  importTargetName?: string;
  hasImport?: boolean;
  hasApkg?: boolean;
  hasRestore?: boolean;
}[] = [];

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLessons: () => mockLessons,
  useLesson: (id: string) => mockLessons?.find((lesson) => lesson.id === id),
  useCourseCardProjections: () => mockCards,
  useSequences: () => mockSequences,
  useOcclusions: () => mockOcclusions,
  useCourseBankBackingDecks: () =>
    new Map([
      [null, mockDeck],
      ['lesson-1', mockDeck],
    ]),
}));

const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Lesson 1',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  lastInteractedAt: Date.now(),
};

// Stub out CardList: assert wiring (cards shown, courseId/assignableLessons passed
// through) without exercising its own internals, which are covered by
// CardList.test.tsx.
vi.mock('../components/cards/CardList', () => ({
  CardList: ({
    cards,
    courseId,
    assignableLessons,
    context,
    heading,
  }: {
    heading?: React.ReactNode;
    cards: Card[];
    courseId?: string;
    assignableLessons?: { id: string; name: string }[];
    context?: {
      importTargetName: string;
      onImport: unknown;
      onApkgImport: unknown;
      onRestore: unknown;
    };
  }) => {
    if (context) {
      observedContexts.push({
        importTargetName: context.importTargetName,
        hasImport: typeof context.onImport === 'function',
        hasApkg: typeof context.onApkgImport === 'function',
        hasRestore: typeof context.onRestore === 'function',
      });
    }
    return (
      <div data-testid="card-list">
        {heading}
        <span data-testid="card-list-count">{cards.length}</span>
        <span data-testid="card-list-course">{courseId}</span>
        <span data-testid="card-list-assignable">
          {assignableLessons?.map((l) => l.name).join(',')}
        </span>
      </div>
    );
  },
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../components/ui/icons', () => ({
  ChevronLeftIcon: () => <svg data-testid="chevron-left" />,
  PlusIcon: () => <svg data-testid="plus-icon" />,
  SearchIcon: () => <svg data-testid="search-icon" />,
  MoreIcon: () => <svg data-testid="more-icon" />,
  ChevronDownIcon: () => <svg data-testid="chevron-down" />,
}));

const course: Course = {
  id: 'course-1',
  name: 'A-Level Economics',
  description: '',
  createdAt: Date.now(),
  updatedAt: 1,
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const lesson1: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Demand',
  description: '',
  orderIndex: 0,
  createdAt: Date.now(),
  updatedAt: 1,
  isExtension: false,
};

const lesson2: Lesson = {
  ...lesson1,
  id: 'lesson-2',
  name: 'Supply',
  orderIndex: 1,
};

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-1',
    conceptId: 'concept-card-1',
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
    type: 'front_back',
    front: 'Front text',
    back: 'Back text',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: Date.now(),
    updatedAt: 1,
    tags: [],
    suspended: false,
    buriedUntil: null,
    courseId: 'course-1',
    primaryLessonId: null,
    ...overrides,
  };
}

function renderPage(entry = '/course/course-1/cards') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/course/:courseId/cards" element={<CardsPage />} />
        <Route path="/course/:courseId/cards/new" element={<p>Card editor</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  observedContexts = [];
  mockCourse = undefined;
  mockLessons = undefined;
  mockCards = undefined;
  mockSequences = [];
  mockOcclusions = [];
});

describe('CardsPage', () => {
  it('keeps Question batch authoring out of the Cards surface', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();

    expect(screen.queryByRole('button', { name: /batch prompt/i })).not.toBeInTheDocument();
  });

  it('waits for the course before rendering its controls', () => {
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Cards' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the course has no cards', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();
    const emptyMessage = screen.getByText('This course has no cards yet.');
    const emptyPanel = emptyMessage.parentElement;
    expect(emptyPanel).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'New card' })).toHaveLength(1);
    expect(within(emptyPanel!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(emptyPanel!).queryByRole('link')).not.toBeInTheDocument();
  });

  it('adds every kind of content through New card, whose editor offers the rarer types', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [makeCard({ id: 'c1' })];

    renderPage();

    expect(screen.queryByRole('button', { name: /More ways to add/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New card' }));
    expect(screen.getByText('Card editor')).toBeInTheDocument();
  });

  it('groups cards by lesson and shows counts', () => {
    mockCourse = course;
    mockLessons = [lesson1, lesson2];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1' }),
      makeCard({ id: 'c2', primaryLessonId: 'lesson-1' }),
      makeCard({ id: 'c3', primaryLessonId: 'lesson-2' }),
    ];
    renderPage();
    expect(screen.getByRole('heading', { name: /Demand/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Supply/ })).toBeInTheDocument();
    expect(screen.getByText('(2)', { exact: false })).toBeInTheDocument();
  });

  it('hands each group heading to its card list, sharing a row with the list actions', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [makeCard({ id: 'c1', primaryLessonId: 'lesson-1' })];
    renderPage();
    const list = screen.getByTestId('card-list');
    expect(within(list).getByRole('heading', { name: /Demand/ })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open lesson' })).toBeInTheDocument();
  });

  it('shows an Unassigned bucket for cards with no primaryLessonId', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1' }),
      makeCard({ id: 'c2', primaryLessonId: null }),
      makeCard({ id: 'c3', primaryLessonId: null }),
    ];
    renderPage();
    expect(screen.getByRole('heading', { name: /Unassigned/ })).toBeInTheDocument();
    const cardLists = screen.getAllByTestId('card-list-count');
    expect(cardLists.map((el) => el.textContent)).toEqual(['1', '2']);
  });

  it('omits a lesson section entirely when that lesson has no cards', () => {
    mockCourse = course;
    mockLessons = [lesson1, lesson2];
    mockCards = [makeCard({ id: 'c1', primaryLessonId: 'lesson-1' })];
    renderPage();
    expect(screen.getByRole('heading', { name: /Demand/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Supply/ })).not.toBeInTheDocument();
  });

  it('passes courseId and assignableLessons through to each CardList group', () => {
    mockCourse = course;
    mockLessons = [lesson1, lesson2];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1' }),
      makeCard({ id: 'c2', primaryLessonId: null }),
    ];
    renderPage();
    const courseIds = screen.getAllByTestId('card-list-course');
    expect(courseIds.every((el) => el.textContent === 'course-1')).toBe(true);
    const assignable = screen.getAllByTestId('card-list-assignable');
    expect(assignable[0].textContent).toBe('Demand,Supply');
    expect(observedContexts.map((context) => context.importTargetName)).toEqual([
      'Demand',
      'A-Level Economics',
    ]);
    expect(
      observedContexts.every(
        (context) => context.hasImport && context.hasApkg && context.hasRestore,
      ),
    ).toBe(true);
  });

  it('navigates to the course-scoped card editor when creating a card from the header', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();
    fireEvent.click(screen.getAllByText('New card')[0]);
    expect(screen.getByText('Card editor')).toBeInTheDocument();
  });

  it('filters cards by search text', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1', front: 'Apple' }),
      makeCard({ id: 'c2', primaryLessonId: 'lesson-1', front: 'Banana' }),
    ];
    renderPage();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search all cards' }), {
      target: { value: 'apple' },
    });
    expect(screen.getByTestId('card-list-count').textContent).toBe('1');
  });

  it('finds course cards through the shared tag syntax and restores shortcut focus', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1', front: 'Apple', tags: ['fruit'] }),
      makeCard({ id: 'c2', primaryLessonId: 'lesson-1', front: 'Stone', tags: ['mineral'] }),
    ];
    renderPage();
    const trigger = screen.getAllByText('New card')[0];
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'f', ctrlKey: true });
    const input = screen.getByRole('searchbox', { name: 'Search all cards' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'tag:fruit' } });
    expect(screen.getByTestId('card-list-count').textContent).toBe('1');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(trigger).toHaveFocus();
  });

  it('narrows the list with a filter chip and shows its count', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [
      makeCard({ id: 'c1', primaryLessonId: 'lesson-1', front: 'Apple', flagged: true }),
      makeCard({ id: 'c2', primaryLessonId: 'lesson-1', front: 'Banana' }),
    ];
    renderPage();
    expect(screen.getByTestId('card-list-count').textContent).toBe('2');
    const chip = screen.getByRole('button', { name: /Flagged/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('card-list-count').textContent).toBe('1');
    fireEvent.click(chip);
    expect(screen.getByTestId('card-list-count').textContent).toBe('2');
  });

  it('offers to clear a search and filters that match nothing', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [makeCard({ id: 'c1', primaryLessonId: 'lesson-1', front: 'Apple' })];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Leech/ }));
    const search = screen.getByRole('searchbox', { name: 'Search all cards' });
    fireEvent.change(search, { target: { value: 'missing' } });
    expect(screen.getByText(/No cards match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('button', { name: /Leech/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('card-list-count').textContent).toBe('1');
  });

  it('restores search and filters from the address, so a return keeps them', () => {
    mockCourse = course;
    mockLessons = [lesson1];
    mockCards = [makeCard({ id: 'c1', primaryLessonId: 'lesson-1' })];
    renderPage('/course/course-1/cards?q=supply&f=due');
    expect(screen.getByRole('searchbox', { name: 'Search all cards' })).toHaveValue('supply');
    expect(
      within(screen.getByRole('group', { name: 'Filter cards' })).getByRole('button', {
        name: /Due/,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
