import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CoursePath } from './CoursePath';
import { ToastProvider } from '../components/ui/Toast';
import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  PracticeMilestone,
  PracticeNode,
} from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import { practiceScopeVersion } from '../course/studyPools';
import type { CourseSummary } from '../state/useCourseData';

const mockNavigate = vi.fn();
const {
  mockCreateLesson,
  mockUpdateCourse,
  mockCreatePracticeNode,
  mockUpdatePracticeNode,
  mockDeletePracticeNode,
  mockCreateCourseAssessment,
  mockUpdateCourseAssessment,
  mockDeleteCourseAssessment,
  mockReorderLessons,
  mockLessonViewProps,
} = vi.hoisted(() => ({
  mockCreateLesson: vi.fn(),
  mockUpdateCourse: vi.fn(),
  mockCreatePracticeNode: vi.fn(),
  mockUpdatePracticeNode: vi.fn(),
  mockDeletePracticeNode: vi.fn(),
  mockCreateCourseAssessment: vi.fn(),
  mockUpdateCourseAssessment: vi.fn(),
  mockDeleteCourseAssessment: vi.fn(),
  mockReorderLessons: vi.fn(),
  mockLessonViewProps: vi.fn(),
}));

let mockCourse: Course | null | undefined;
let mockLessons: Lesson[] | undefined;
let mockAssessments: CourseAssessment[] | undefined;
let mockCourseCards: Card[] | undefined;
let mockSummary: CourseSummary | null | undefined;
let mockPracticeNodes: PracticeNode[] | undefined;
let mockPendingMerge: null;
let mockPerformance: unknown[] | undefined;
const live = vi.hoisted(() => ({
  links: [] as LessonCardLink[],
  exposures: [] as LessonCardExposure[],
  completions: [] as LessonCompletion[],
  milestones: [] as PracticeMilestone[],
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  function TestMemoryRouter(props: React.ComponentProps<typeof actual.MemoryRouter>) {
    return React.createElement(actual.MemoryRouter, {
      ...props,
      future: {
        ...props.future,
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      },
    });
  }
  return {
    ...actual,
    MemoryRouter: TestMemoryRouter,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (querier: () => unknown) => {
    const source = Function.prototype.toString.call(querier);
    if (source.includes('lessonCardExposures')) return live.exposures;
    if (source.includes('lessonCompletions')) return live.completions;
    if (source.includes('practiceMilestones')) return live.milestones;
    if (source.includes('lessonCards')) return live.links;
    return [];
  },
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLessons: () => mockLessons,
  useCourseAssessments: () => mockAssessments,
  useCourseCards: () => mockCourseCards,
  useCoursePerformance: () => mockPerformance,
  useCourseSummary: () => mockSummary,
  usePracticeNodes: () => mockPracticeNodes,
  usePendingMergeReview: () => mockPendingMerge,
}));

vi.mock('./LessonView', () => ({
  LessonView: (props: unknown) => {
    mockLessonViewProps(props);
    return null;
  },
}));

vi.mock('../db/repository', () => ({
  createLesson: mockCreateLesson,
  updateCourse: mockUpdateCourse,
  createPracticeNode: mockCreatePracticeNode,
  updatePracticeNode: mockUpdatePracticeNode,
  deletePracticeNode: mockDeletePracticeNode,
  createCourseAssessment: mockCreateCourseAssessment,
  updateCourseAssessment: mockUpdateCourseAssessment,
  deleteCourseAssessment: mockDeleteCourseAssessment,
  reorderLessons: mockReorderLessons,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: vi.fn() }),
}));

const course: Course = {
  id: 'course-1',
  name: 'Mechanics',
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

const lesson1: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Kinematics',
  orderIndex: 0,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};

const lesson2: Lesson = {
  id: 'lesson-2',
  courseId: 'course-1',
  name: 'Dynamics',
  orderIndex: 1,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};

const practiceNode: PracticeNode = {
  id: 'practice-1',
  courseId: 'course-1',
  type: 'manual',
  name: 'Weekly review',
  position: 0,
  createdAt: 0,
  updatedAt: 0,
};

const summary: CourseSummary = {
  lessonCount: 2,
  cardCount: 0,
  mastery: 0,
  unreviewed: 0,
  eligible: 0,
  completedLessonCount: 0,
  reviewedCardCount: 0,
  reviewedTodayCount: 0,
};

function makeCard(id: string, lessonId: string): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
    courseId: 'course-1',
    primaryLessonId: lessonId,
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

function showCompletedPractice() {
  const card = makeCard('card-1', 'lesson-1');
  mockCourseCards = [card];
  mockPracticeNodes = [practiceNode];
  live.exposures = [{ lessonId: 'lesson-1', cardId: 'card-1', taughtAt: 1, updatedAt: 1 }];
  live.milestones = [
    {
      nodeKey: 'practice-1',
      courseId: 'course-1',
      scopeVersion: practiceScopeVersion([card]),
      securedCardCount: 1,
      totalCardCount: 1,
      updatedAt: 1,
      completedAt: 1,
    },
  ];
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1']}>
      <ToastProvider>
        <Routes>
          <Route path="/course/:courseId" element={<CoursePath />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = course;
  mockLessons = [lesson1, lesson2];
  mockAssessments = [];
  mockCourseCards = [];
  mockSummary = summary;
  mockPracticeNodes = [];
  mockPendingMerge = null;
  mockPerformance = [];
  live.links = [];
  live.exposures = [];
  live.completions = [];
  live.milestones = [];
  mockNavigate.mockClear();
  mockCreateLesson.mockReset();
  mockCreateLesson.mockResolvedValue({
    ...lesson2,
    id: 'lesson-3',
    name: 'Lesson 3',
    orderIndex: 2,
  });
  mockUpdateCourse.mockReset();
  mockUpdateCourse.mockResolvedValue(undefined);
  mockCreatePracticeNode.mockReset();
  mockCreatePracticeNode.mockResolvedValue(undefined);
  mockUpdatePracticeNode.mockReset();
  mockDeletePracticeNode.mockReset();
  mockCreateCourseAssessment.mockReset();
  mockCreateCourseAssessment.mockResolvedValue(undefined);
  mockUpdateCourseAssessment.mockReset();
  mockUpdateCourseAssessment.mockResolvedValue(undefined);
  mockDeleteCourseAssessment.mockReset();
  mockDeleteCourseAssessment.mockResolvedValue(undefined);
  mockReorderLessons.mockReset();
  mockLessonViewProps.mockReset();
});

describe('CoursePath Study mode', () => {
  it('renders archived courses as a read-only path with no study or authoring exits', () => {
    mockCourse = { ...course, archived: true, lessonViewMode: 'edit' };

    renderPage();

    expect(screen.getByText('Archived course')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Archived courses' })).toHaveAttribute(
      'href',
      '/archived',
    );
    expect(screen.queryByRole('navigation', { name: 'Course sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Practice Now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Author mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kinematics' })).toBeDisabled();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('offers one explicit Author mode beside the course sections', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Author mode' }));

    expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { lessonViewMode: 'edit' });
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('starts course-wide practice from the header', () => {
    const card = makeCard('card-1', 'lesson-1');
    mockCourseCards = [card];
    live.exposures = [{ lessonId: 'lesson-1', cardId: 'card-1', taughtAt: 1, updatedAt: 1 }];

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Practice Now' }));

    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/study?review=due');
  });

  it('disables course-wide practice when no reached card is eligible', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Practice Now' })).toBeDisabled();
  });

  it('exposes course-wide practice in a single-lesson course header', async () => {
    const card = makeCard('card-1', 'lesson-1');
    mockLessons = [lesson1];
    mockCourseCards = [card];
    live.exposures = [{ lessonId: 'lesson-1', cardId: 'card-1', taughtAt: 1, updatedAt: 1 }];

    renderPage();
    await waitFor(() => {
      expect(mockLessonViewProps).toHaveBeenCalledWith(
        expect.objectContaining({
          practiceNowEnabled: true,
          onAddPractice: expect.any(Function),
          onAddCheckpoint: expect.any(Function),
        }),
      );
    });
  });

  it('hides start, end and mid-path Manual practice', () => {
    renderPage();
    expect(
      screen.queryByRole('button', { name: 'Add manual practice here' }),
    ).not.toBeInTheDocument();
  });

  it('hides the practice-node pencil on a visible practice node', () => {
    showCompletedPractice();
    renderPage();
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Weekly review' })).not.toBeInTheDocument();
  });

  it('hides Add lesson on an empty path', () => {
    mockLessons = [];
    renderPage();
    expect(screen.getByText('This course has no lessons yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });

  it('hides Add lesson on a populated path', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Kinematics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });

  it('hides the course rename control', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('hides path-authoring actions', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Add checkpoint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add practice' })).not.toBeInTheDocument();
  });

  it('keeps a locked distributed copy in Study mode across every path authoring gate', () => {
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
    mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    renderPage();

    expect(screen.getByText('Authoring is locked for shared courses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Author mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add checkpoint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open checkpoint: Paper 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit checkpoint: Paper 1' })).not.toBeInTheDocument();
  });
});

describe('CoursePath Author mode', () => {
  beforeEach(() => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
  });

  it('creates manual practice from the path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add practice' }));
    expect(screen.getByRole('dialog', { name: 'Add manual practice' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockCreatePracticeNode).toHaveBeenCalledWith(
        'course-1',
        expect.objectContaining({ type: 'manual', name: 'Practice', position: 1 }),
      );
    });
  });

  it('creates a checkpoint from the path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add checkpoint' }));
    expect(screen.getByRole('dialog', { name: 'Add checkpoint' })).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, {
      target: { value: 'Paper 1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));

    await waitFor(() => {
      expect(mockCreateCourseAssessment).toHaveBeenCalledWith(
        'course-1',
        'Paper 1',
        expect.any(Number),
        expect.objectContaining({ afterLessonId: 'lesson-2', coverageMode: 'prefix' }),
      );
    });
  });

  it('restores the Add checkpoint control after cancelling checkpoint creation', async () => {
    renderPage();
    const opener = screen.getByRole('button', { name: 'Add checkpoint' });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('restores the Add checkpoint control after closing checkpoint creation with Escape', async () => {
    renderPage();
    const opener = screen.getByRole('button', { name: 'Add checkpoint' });
    opener.focus();
    fireEvent.click(opener);

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.keyDown(nameInput, { key: 'Escape' });

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab trapped in the checkpoint editor when its date picker is open', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add checkpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Date and time' }));

    const done = screen.getByRole('button', { name: 'Done' });
    done.focus();
    fireEvent.keyDown(done, { key: 'Tab' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close editor' })).toHaveFocus());
  });

  it('edits a checkpoint directly from its path node', async () => {
    mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));

    expect(screen.getByRole('dialog', { name: 'Edit checkpoint' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Paper 1 details' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Revised Paper 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));

    await waitFor(() => {
      expect(mockUpdateCourseAssessment).toHaveBeenCalledWith(
        'assessment-1',
        expect.objectContaining({ name: 'Revised Paper 1' }),
      );
    });
  });

  it('confirms checkpoint deletion before removing it from the repository', async () => {
    mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));
    const deleteTrigger = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteTrigger);

    expect(screen.getByRole('status')).toHaveTextContent('Delete checkpoint?');
    expect(screen.getByRole('button', { name: 'Keep checkpoint' })).toHaveFocus();
    expect(mockDeleteCourseAssessment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => {
      expect(mockDeleteCourseAssessment).toHaveBeenCalledWith('assessment-1');
    });
  });

  it('restores the checkpoint Delete trigger after cancelling deletion', async () => {
    mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep checkpoint' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus());
    expect(mockDeleteCourseAssessment).not.toHaveBeenCalled();
  });

  it('creates practice at the single lesson position from the lesson header', async () => {
    mockLessons = [lesson1];
    renderPage();

    await waitFor(() => expect(mockLessonViewProps).toHaveBeenCalled());
    const lessonViewProps = mockLessonViewProps.mock.lastCall?.[0] as {
      onAddPractice: () => void;
    };
    act(() => lessonViewProps.onAddPractice());
    expect(screen.getByRole('dialog', { name: 'Add manual practice' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockCreatePracticeNode).toHaveBeenCalledWith(
        'course-1',
        expect.objectContaining({ type: 'manual', name: 'Practice', position: 0 }),
      );
    });
  });

  it('anchors a single-lesson checkpoint after that lesson', async () => {
    mockLessons = [lesson1];
    renderPage();

    await waitFor(() => expect(mockLessonViewProps).toHaveBeenCalled());
    const lessonViewProps = mockLessonViewProps.mock.lastCall?.[0] as {
      onAddCheckpoint: () => void;
    };
    act(() => lessonViewProps.onAddCheckpoint());

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, { target: { value: 'Solo checkpoint' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));

    await waitFor(() => {
      expect(mockCreateCourseAssessment).toHaveBeenCalledWith(
        'course-1',
        'Solo checkpoint',
        expect.any(Number),
        expect.objectContaining({ afterLessonId: 'lesson-1', coverageMode: 'prefix' }),
      );
    });
  });

  it('opens the editor from the practice-node pencil', () => {
    mockPracticeNodes = [practiceNode];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly review' }));
    expect(screen.getByRole('dialog', { name: 'Edit manual practice' })).toBeInTheDocument();
  });

  it('creates a lesson from an empty path', async () => {
    mockLessons = [];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Lesson 1');
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
    });
  });

  it('creates a lesson from a populated path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Lesson 3');
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
    });
  });

  it('renames the course from its header', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    const input = screen.getByRole('textbox', { name: 'course name' });
    fireEvent.change(input, { target: { value: 'Further mechanics' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { name: 'Further mechanics' });
    });
  });
});
