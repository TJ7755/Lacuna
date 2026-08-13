import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuestionBank } from './QuestionBank';
import type { Card, Course, LegacyDeckRecord, Lesson, Occlusion, Sequence } from '../db/types';

let mockCourse: Course | undefined;
let mockLessons: Lesson[] | undefined;
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
  useCourseCards: () => mockCards,
  useSequences: () => mockSequences,
  useOcclusions: () => mockOcclusions,
  useCourseBankBackingDecks: () => new Map([[null, mockDeck], ['lesson-1', mockDeck]]),
}));

const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Lesson 1',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  fsrsVersion: 6,
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
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
    onNewCard,
    context,
  }: {
    cards: Card[];
    courseId?: string;
    assignableLessons?: { id: string; name: string }[];
    onNewCard?: () => void;
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
      <span data-testid="card-list-count">{cards.length}</span>
      <span data-testid="card-list-course">{courseId}</span>
      <span data-testid="card-list-assignable">{assignableLessons?.map((l) => l.name).join(',')}</span>
      {onNewCard && (
        <button type="button" onClick={onNewCard}>
          new-card
        </button>
      )}
    </div>
    );
  },
}));

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('../components/ui/icons', () => ({
  ChevronLeftIcon: () => <svg data-testid="chevron-left" />,
  PlusIcon: () => <svg data-testid="plus-icon" />,
  SearchIcon: () => <svg data-testid="search-icon" />,
  SparklesIcon: () => <svg data-testid="sparkles-icon" />,
}));

vi.mock('../components/items/BatchAuthoringPromptDialog', () => ({
  BatchAuthoringPromptDialog: ({ courseName, onClose }: { courseName: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Generate item batch">
      <span>{courseName}</span>
      <button type="button" onClick={onClose}>close-batch</button>
    </div>
  ),
}));

const course: Course = {
  id: 'course-1',
  name: 'A-Level Economics',
  description: '',
  createdAt: Date.now(),
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
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
    tags: [],
    suspended: false,
    buriedUntil: null,
    courseId: 'course-1',
    primaryLessonId: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/bank']}>
      <Routes>
        <Route path="/course/:courseId/bank" element={<QuestionBank />} />
        <Route path="/course/:courseId/cards/new" element={<p>Card editor</p>} />
      </Routes>
    </MemoryRouter>,
  );
}  beforeEach(() => {
  observedContexts = [];
  mockCourse = undefined;
  mockLessons = undefined;
  mockCards = undefined;
  mockSequences = [];
  mockOcclusions = [];
});

describe('QuestionBank', () => {
  it('opens the course-scoped batch authoring prompt', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Build external batch prompt' }));
    expect(screen.getByRole('dialog', { name: 'Generate item batch' })).toHaveTextContent(
      'A-Level Economics',
    );
  });

  it('shows a skeleton while loading', () => {
    renderPage();
    expect(screen.queryByText('Question bank')).not.toBeInTheDocument();
  });

  it('shows an empty state when the course has no cards', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();
    expect(screen.getByText('This course has no cards yet.')).toBeInTheDocument();
    expect(screen.getAllByText('New card')).not.toHaveLength(0);
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
    fireEvent.change(screen.getByPlaceholderText('Search all cards…'), {
      target: { value: 'apple' },
    });
    expect(screen.getByTestId('card-list-count').textContent).toBe('1');
  });
});
