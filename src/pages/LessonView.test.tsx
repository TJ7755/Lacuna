import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { LessonView } from './LessonView';
import type { Card, Course, Lesson, Note } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';

const mockNavigate = vi.fn();
let mockLesson: Lesson | null | undefined;
let mockCourse: Course | undefined;
let mockLessons: Lesson[] | undefined;
let mockExamDates: unknown[] | undefined;
let mockNotes: Note[] | undefined;
let mockLessonCards: Card[] | undefined;
let mockGlobalLessonViewMode: 'study' | 'edit' = 'study';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mockLesson,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLessons: () => mockLessons,
  useCourseExamDates: () => mockExamDates,
  useNotes: () => mockNotes,
  useLessonCards: () => mockLessonCards,
}));

vi.mock('../state/useData', () => ({
  useDeck: () => undefined,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../state/lessonViewMode', () => ({
  useLessonViewMode: () => [mockGlobalLessonViewMode, vi.fn()],
}));

const course: Course = {
  id: 'course-1',
  name: 'Test course',
  description: '',
  createdAt: 0,
  examDate: Date.now() + 7 * MS_PER_DAY,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 60,
  practiceThresholdMinutesNear: 30,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 5,
};

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Test lesson',
  orderIndex: 0,
  createdAt: 0,
  isExtension: false,
};

const note: Note = {
  id: 'note-1',
  lessonId: 'lesson-1',
  name: 'A note',
  content: 'Some **markdown** content',
  orderIndex: 0,
  createdAt: 0,
};

function makeCard(id: string): Card {
  return {
    id,
    deckId: 'deck-1',
    type: 'front_back',
    front: 'front',
    back: 'back',
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
    createdAt: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/lesson/lesson-1']}>
      <Routes>
        <Route path="/course/:courseId/lesson/:lessonId" element={<LessonView />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockLesson = lesson;
  mockCourse = course;
  mockLessons = [lesson];
  mockExamDates = [];
  mockNotes = [note];
  mockLessonCards = [makeCard('card-1')];
  mockGlobalLessonViewMode = 'study';
  mockNavigate.mockClear();
});

describe('LessonView study mode', () => {
  it('renders notes read-only, with no add/edit/delete controls', () => {
    renderPage();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete note')).not.toBeInTheDocument();
  });

  it('shows a cards summary instead of the editable card list', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Cards/ })).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Mastery')).toBeInTheDocument();
    expect(screen.queryByText('Add your first card')).not.toBeInTheDocument();
  });
});

describe('LessonView edit mode', () => {
  beforeEach(() => {
    mockGlobalLessonViewMode = 'edit';
  });

  it('renders the full notes CRUD section', () => {
    renderPage();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.getByText('Add note')).toBeInTheDocument();
  });

  it('renders the editable cards section rather than the summary', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Cards/ })).toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('a course override takes priority over the global default', () => {
    mockCourse = { ...course, lessonViewMode: 'study' };
    renderPage();
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
  });
});
