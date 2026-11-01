import { CourseSectionNavigation } from '../components/course/CourseSectionNavigation';
import { afterAll, beforeAll, vi } from 'vitest';
import { domAnimation, LazyMotion } from 'motion/react';
import { render } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type * as MotionSpeedState from '../state/motionSpeed';
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
  PendingMergeReview,
  PracticeMilestone,
  PracticeNode,
} from '@lacuna/core/db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { practiceScopeVersion } from '../course/studyPools';
export const pathState = {
  mockCourse: undefined as Course | null | undefined,
  mockLessons: undefined as Lesson[] | undefined,
  mockAssessments: undefined as CourseAssessment[] | undefined,
  mockCourseCards: undefined as Card[] | undefined,
  mockPracticeNodes: undefined as PracticeNode[] | undefined,
  mockPendingMerge: undefined as PendingMergeReview | null | undefined,
  mockPerformance: undefined as unknown[] | undefined,
};
// Use the same motion provider as the app and the JS engine used by path-editor tests.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});

afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});
export const mockNavigate = vi.fn();
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
}));
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
    if (source.includes('listQuestionSetAttempts')) {
      return [
        {
          id: 'question-set-1',
          content: {
            id: 'question-set-1',
            courseId: 'course-1',
            title: 'Question set',
            lessonIds: [],
            assessmentIds: [],
            contentVersion: 1,
            contentRevisionId: 'content-1',
            createdAt: 1,
            updatedAt: 1,
            questions: [],
          },
          attempt: null,
          exam: undefined,
        },
      ];
    }
    if (source.includes('lessonCardExposures')) return live.exposures;
    if (source.includes('lessonCompletions')) return live.completions;
    if (source.includes('practiceMilestones')) return live.milestones;
    if (source.includes('lessonCards')) return live.links;
    return [];
  },
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => pathState.mockCourse,
  useLessons: () => pathState.mockLessons,
  useCourseAssessments: () => pathState.mockAssessments,
  useCourseCards: () => pathState.mockCourseCards,
  usePracticeNodes: () => pathState.mockPracticeNodes,
  usePendingMergeReview: () => pathState.mockPendingMerge,
}));

vi.mock('../state/useCourseStudyFlowRecords', () => ({
  useCoursePathRecords: () => {
    if (
      pathState.mockCourse === undefined ||
      pathState.mockLessons === undefined ||
      pathState.mockAssessments === undefined ||
      pathState.mockCourseCards === undefined ||
      pathState.mockPracticeNodes === undefined ||
      pathState.mockPerformance === undefined
    )
      return undefined;
    return {
      course: pathState.mockCourse,
      lessons: pathState.mockLessons,
      assessments: pathState.mockAssessments,
      cards: pathState.mockCourseCards,
      practiceNodes: pathState.mockPracticeNodes,
      performance: pathState.mockPerformance,
      links: live.links,
      exposures: live.exposures,
      completions: live.completions,
      milestones: live.milestones,
    };
  },
}));

vi.mock('./LessonView', () => ({ LessonView: () => null }));

vi.mock('../db/lessonRepository', () => ({
  createLesson: mockCreateLesson,
  reorderLessons: mockReorderLessons,
}));

vi.mock('../db/courseRepository', () => ({ updateCourse: mockUpdateCourse }));

vi.mock('../db/practiceNodeRepository', () => ({
  createPracticeNode: mockCreatePracticeNode,
  updatePracticeNode: mockUpdatePracticeNode,
  deletePracticeNode: mockDeletePracticeNode,
}));

vi.mock('../db/assessmentRepository', () => ({
  createCourseAssessment: mockCreateCourseAssessment,
  updateCourseAssessment: mockUpdateCourseAssessment,
  deleteCourseAssessment: mockDeleteCourseAssessment,
}));

vi.mock('../state/motionSpeed', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionSpeedState>();
  return { ...actual, useMotionSpeed: () => ['fast'] };
});
const mockOpenStudySheet = vi.hoisted(() => vi.fn());

vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: mockOpenStudySheet }),
}));
export const course: Course = {
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
export const lesson1: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Kinematics',
  orderIndex: 0,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};
export const lesson2: Lesson = {
  id: 'lesson-2',
  courseId: 'course-1',
  name: 'Dynamics',
  orderIndex: 1,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};
export const practiceNode: PracticeNode = {
  id: 'practice-1',
  courseId: 'course-1',
  type: 'manual',
  name: 'Weekly review',
  position: 0,
  createdAt: 0,
  updatedAt: 0,
};
export function makeCard(id: string, lessonId: string): Card {
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
export function showCompletedPractice() {
  const card = makeCard('card-1', 'lesson-1');
  pathState.mockCourseCards = [card];
  pathState.mockPracticeNodes = [practiceNode];
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
export function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/course/course-1${search}`]}>
      <ToastProvider>
        <LazyMotion features={domAnimation}>
          <Routes>
            <Route
              path="/course/:courseId"
              element={
                <>
                  <CourseSectionNavigation courseId="course-1" />
                  <CoursePath />
                </>
              }
            />
          </Routes>
        </LazyMotion>
      </ToastProvider>
    </MemoryRouter>,
  );
}
export function resetCoursePathFixtures() {
  pathState.mockCourse = course;
  pathState.mockLessons = [lesson1, lesson2];
  pathState.mockAssessments = [];
  pathState.mockCourseCards = [];
  pathState.mockPracticeNodes = [];
  pathState.mockPendingMerge = null;
  pathState.mockPerformance = [];
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
}

export {
  mockCreateLesson,
  mockUpdateCourse,
  mockCreatePracticeNode,
  mockUpdatePracticeNode,
  mockDeletePracticeNode,
  mockCreateCourseAssessment,
  mockUpdateCourseAssessment,
  mockDeleteCourseAssessment,
  mockReorderLessons,
  live,
  mockOpenStudySheet,
};
