import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { LessonView } from './LessonView';
import { CourseSectionNavigation } from '../components/course/CourseSectionNavigation';
import { ToastProvider } from '../components/ui/Toast';
import type { Card, Course, Lesson, Note } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';

const mockNavigate = vi.fn();
const { mockCreateLesson, mockUpdateCourse, mockUpdateLesson } = vi.hoisted(() => ({
  mockCreateLesson: vi.fn(),
  mockUpdateCourse: vi.fn(),
  mockUpdateLesson: vi.fn(),
}));
let mockLesson: Lesson | null | undefined;
let mockCourse: Course | undefined;
let mockLessons: Lesson[] | undefined;
let mockExamDates: unknown[] | undefined;
let mockNotes: Note[] | undefined;
let mockLessonCards: Card[] | undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  function TestMemoryRouter(props: React.ComponentProps<typeof actual.MemoryRouter>) {
    return React.createElement(actual.MemoryRouter, {
      ...props,
    });
  }
  return {
    ...actual,
    MemoryRouter: TestMemoryRouter,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mockLesson,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLesson: () => mockLesson,
  useLessons: () => mockLessons,
  useCourseAssessments: () => mockExamDates,
  useNotes: () => mockNotes,
  useLessonCards: () => mockLessonCards,
  useLessonCardLinks: () => [],
  useCourseCards: () => mockLessonCards,
  useSequences: () => [],
  useOcclusions: () => [],
  useLessonBackingDeck: () => undefined,
}));

vi.mock('../db/lessonRepository', () => ({
  createLesson: mockCreateLesson,
  updateLesson: mockUpdateLesson,
}));
vi.mock('../db/courseRepository', () => ({ updateCourse: mockUpdateCourse }));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

const course: Course = {
  id: 'course-1',
  name: 'Test course',
  description: '',
  createdAt: 0,
  updatedAt: 0,
  examDate: Date.now() + 7 * MS_PER_DAY,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Test lesson',
  orderIndex: 0,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};

const note: Note = {
  id: 'note-1',
  lessonId: 'lesson-1',
  name: 'A note',
  content: 'Some **markdown** content',
  orderIndex: 0,
  createdAt: 0,
  updatedAt: 0,
};

function makeCard(id: string): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
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
    updatedAt: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/lesson/lesson-1']}>
      <ToastProvider>
        <Routes>
          <Route path="/course/:courseId/lesson/:lessonId" element={<LessonView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function renderInline(
  showStudyNow = false,
  practiceNowEnabled = false,
  pathActions?: { onAddPractice: () => void; onAddCheckpoint: () => void },
) {
  return render(
    <MemoryRouter initialEntries={['/course/course-1']}>
      <ToastProvider>
        <CourseSectionNavigation courseId="course-1" />
        <LessonView
          courseId="course-1"
          lessonId="lesson-1"
          showStudyNow={showStudyNow}
          practiceNowEnabled={practiceNowEnabled}
          onAddPractice={pathActions?.onAddPractice}
          onAddCheckpoint={pathActions?.onAddCheckpoint}
        />
      </ToastProvider>
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
  mockNavigate.mockClear();
  mockCreateLesson.mockReset();
  mockCreateLesson.mockResolvedValue({
    ...lesson,
    id: 'lesson-2',
    name: 'Lesson 2',
    orderIndex: 1,
  });
  mockUpdateCourse.mockReset();
  mockUpdateCourse.mockResolvedValue(undefined);
  mockUpdateLesson.mockReset();
  mockUpdateLesson.mockResolvedValue(undefined);
});

describe('LessonView View mode', () => {
  it('preselects this lesson for an optional Simple Learn pass', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Simple Learn'));
    expect(await screen.findByLabelText('Simple Learn scope')).toHaveValue(lesson.id);
    fireEvent.click(screen.getByRole('button', { name: 'Start Simple Learn' }));
    expect(mockNavigate).toHaveBeenCalledWith(`/lesson/${lesson.id}/learn?mode=simple`);
  });

  it('does not promise another lesson when the displayed lesson has nothing due', () => {
    mockLessonCards = [
      {
        ...makeCard('future'),
        state: 2,
        stability: 1,
        lastReviewed: Date.now(),
        due: Date.now() + MS_PER_DAY,
      },
    ];
    renderInline(true);
    expect(screen.getByText('Nothing due right now.')).toBeInTheDocument();
    expect(screen.queryByText(/next lesson available/i)).not.toBeInTheDocument();
  });

  it('keeps an archived single-lesson course read-only', () => {
    mockCourse = { ...course, archived: true, lessonViewMode: 'edit' };

    const { container } = renderInline(true, true, {
      onAddPractice: vi.fn(),
      onAddCheckpoint: vi.fn(),
    });

    expect(screen.getByText('Archived course')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Archived courses' })).toHaveAttribute(
      'href',
      '/archived',
    );
    expect(screen.queryByRole('navigation', { name: 'Course sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Practice Now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename lesson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add checkpoint' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-lesson-workspace-mode="study"]')).not.toBeNull();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
    expect(mockUpdateLesson).not.toHaveBeenCalled();
  });

  it('offers the shared Edit mode on a normal lesson route', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit mode' }));

    expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { lessonViewMode: 'edit' });
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('renders notes read-only, with no add/edit/delete controls', () => {
    const { container } = renderPage();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete note')).not.toBeInTheDocument();
    expect(container.querySelector('[data-lesson-workspace-mode="study"]')).not.toBeNull();
  });

  it('does not show a Course settings link when rendered via the normal route', () => {
    renderPage();
    expect(screen.queryByLabelText('Course settings')).not.toBeInTheDocument();
  });

  it('lists the lesson cards without edit controls', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Cards in this lesson' })).toBeInTheDocument();
    expect(screen.getByText('front')).toBeInTheDocument();
    expect(screen.getByText('Front / back · New')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New card' })).not.toBeInTheDocument();
    expect(screen.queryByText('Add your first card')).not.toBeInTheDocument();
  });

  it('summarises learnt cards and notes on one line', () => {
    mockLessonCards = [makeCard('a'), { ...makeCard('b'), state: 2, lastReviewed: 1 }];
    renderPage();
    expect(screen.getByText(/^1 of 2 cards learnt · 1 note/)).toBeInTheDocument();
  });

  it('starts the lesson from the primary Study action', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Study' }));
    expect(mockNavigate).toHaveBeenCalledWith('/lesson/lesson-1/learn');
  });

  it('turns several notes into tabs and switches between them', () => {
    mockNotes = [note, { ...note, id: 'note-2', name: 'Second note', content: 'Other body', orderIndex: 1 }];
    renderPage();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['A note', 'Second note']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tabs[1]);
    expect(screen.getByRole('tab', { name: 'Second note' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps a locked distributed copy in View mode across every lesson authoring gate', () => {
    mockCourse = {
      ...course,
      lessonViewMode: 'edit',
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    };

    renderInline(false, false, {
      onAddPractice: vi.fn(),
      onAddCheckpoint: vi.fn(),
    });

    expect(
      screen.getByRole('link', { name: 'Authoring is locked for shared courses' }),
    ).toHaveAttribute('href', '/course/course-1/settings');
    expect(screen.queryByRole('button', { name: 'Edit mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add checkpoint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename lesson' })).not.toBeInTheDocument();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
  });
});

describe('LessonView inline (single-lesson course) rendering', () => {
  it('shows one generic course Study action', () => {
    renderInline(true);

    expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review due cards' })).not.toBeInTheDocument();
  });

  it('starts course-wide practice from the header when eligible', () => {
    renderInline(true, true);

    fireEvent.click(screen.getByRole('button', { name: 'Practice Now' }));

    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study?review=due');
  });

  it('disables course-wide practice when no reached card is eligible', () => {
    renderInline(true);

    expect(screen.getByRole('button', { name: 'Practice Now' })).toBeDisabled();
  });

  it('shows the course navigation with a Settings link', () => {
    renderInline();
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/course/course-1/settings');
  });

  it('hides Add lesson in View mode', () => {
    renderInline();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });
});

describe('LessonView title editing', () => {
  it('hides the lesson rename control in View mode', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Rename lesson' })).not.toBeInTheDocument();
    expect(mockUpdateLesson).not.toHaveBeenCalled();
  });
});

describe('LessonView Edit mode', () => {
  beforeEach(() => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
  });

  it('renders the full notes CRUD section', () => {
    const { container } = renderPage();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.getByText('Add note')).toBeInTheDocument();
    expect(container.querySelector('[data-lesson-workspace-mode="edit"]')).not.toBeNull();
  });

  it('shows edit controls on each card row and the management section', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Cards in this lesson' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit card' })).toHaveAttribute(
      'href',
      '/course/course-1/lesson/lesson-1/cards/card-1/edit',
    );
    expect(screen.getByRole('button', { name: 'New card' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Manage/ })).toBeInTheDocument();
  });

  it('opens a newly created lesson from the inline path', async () => {
    renderInline();
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Lesson 2');
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-2');
    });
  });

  it('keeps practice and checkpoint creation on a single-lesson path', () => {
    const onAddPractice = vi.fn();
    const onAddCheckpoint = vi.fn();

    renderInline(false, false, { onAddPractice, onAddCheckpoint });
    fireEvent.click(screen.getByRole('button', { name: 'Add practice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add checkpoint' }));

    expect(onAddPractice).toHaveBeenCalledOnce();
    expect(onAddCheckpoint).toHaveBeenCalledOnce();
  });

  it('renames the lesson from its header', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Rename lesson' }));
    const input = screen.getByRole('textbox', { name: 'lesson name' });
    fireEvent.change(input, { target: { value: 'Renamed lesson' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateLesson).toHaveBeenCalledWith('lesson-1', { name: 'Renamed lesson' });
    });
  });
});
