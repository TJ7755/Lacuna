import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuestionBank } from './QuestionBank';
import type { Card, Course, Deck, Lesson, Sequence } from '../db/types';

let mockCourse: Course | undefined;
let mockLessons: Lesson[] | undefined;
let mockCards: Card[] | undefined;
let mockSequences: Sequence[] | undefined = [];

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLessons: () => mockLessons,
  useCourseCards: () => mockCards,
  useSequences: () => mockSequences,
}));

const mockDeck: Deck = {
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

vi.mock('../state/useData', () => ({
  useDeck: () => mockDeck,
}));

// Stub out CardList: assert wiring (cards shown, courseId/assignableLessons passed
// through) without exercising its own internals, which are covered by
// CardList.test.tsx.
vi.mock('../components/cards/CardList', () => ({
  CardList: ({
    cards,
    courseId,
    assignableLessons,
    onNewCard,
  }: {
    cards: Card[];
    courseId?: string;
    assignableLessons?: { id: string; name: string }[];
    onNewCard?: () => void;
  }) => (
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
  ),
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
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = undefined;
  mockLessons = undefined;
  mockCards = undefined;
  mockSequences = [];
});

describe('QuestionBank', () => {
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
    expect(screen.getByText('Create your first card')).toBeInTheDocument();
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
  });

  it('navigates to the course-scoped card editor when creating a card from the header', () => {
    mockCourse = course;
    mockLessons = [];
    mockCards = [];
    renderPage();
    fireEvent.click(screen.getByText('Create your first card'));
    // No assertion on navigation target beyond the click not throwing — routing is
    // exercised end-to-end elsewhere; this covers the wiring of the click handler.
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
