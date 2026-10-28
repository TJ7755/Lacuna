import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import type { QuestionAttempt, QuestionDefinition } from '../questions/types';
import { CourseAnalytics } from './CourseAnalytics';
import { ToastProvider } from '../components/ui/Toast';
import { CourseSectionNavigation } from '../components/course/CourseSectionNavigation';
import { makeCard, makeCourse, makeExamDate, makeLesson } from '../course/path.testFixtures';
import type { Course } from '../db/types';
import { MS_PER_DAY } from '../fsrs/params';

const mocks = vi.hoisted(() => ({
  questionData: undefined as CourseQuestionData | undefined,
  course: { id: 'course-1', name: 'Mathematics', archived: false } as Course,
  records: undefined as unknown,
  openStudySheet: vi.fn(),
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mocks.course,
  useCourseReviewHistory: () => [],
}));

vi.mock('../state/useCourseProgressRecords', () => ({
  useCourseProgressRecords: () => mocks.records,
}));

vi.mock('../state/useQuestionEvidence', async () => {
  const { buildQuestionEvidence } = await import('../course/questionEvidence');
  // The Concept practice read is the database's; the page's scoping and aggregation are real.
  return {
    useQuestionEvidence: (_courseId: string, conceptIds: string[] | undefined) =>
      conceptIds &&
      buildQuestionEvidence(
        [
          {
            conceptId: 'concept-a1',
            diagnosticEvidence: [
              {
                categoryId: 'knowledge',
                demonstratedCount: 1,
                gapCount: 1,
                lastObservedAt: 1,
                latestOutcome: 'gap',
              },
            ],
          },
        ],
        conceptIds,
      ),
  };
});

vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: mocks.openStudySheet }),
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.questionData,
}));

vi.mock('../components/analytics/CourseAnalytics', () => ({
  CourseAnalytics: () => <div>Card analytics charts</div>,
}));

vi.mock('../components/analytics/CourseForecastCard', () => ({
  CourseForecastCard: () => <section>Exam-day forecast</section>,
}));

vi.mock('../components/course/CourseTabs', () => ({
  CourseTabs: () => <nav>Course tabs</nav>,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

function generatedQuestion(): QuestionDefinition {
  return {
    id: 'family-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Integer-root quadratics',
    tags: [],
    suspended: false,
    kind: 'generated',
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: {},
    contentVersion: 1,
    contentRevisionId: 'content-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: 1,
    scheduleEpoch: { id: 'epoch-1', startedAt: 1, reason: 'created', baseline: { kind: 'new' } },
    stability: 1,
    difficulty: 5,
    lastReviewed: 1,
    reps: 1,
    lapses: 0,
    state: 2,
    due: 20_000,
    scheduledDays: 1,
    learningSteps: 0,
    scheduleUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function novelAttempt(): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'family-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: 1,
    answeredAt: 2,
    updatedAt: 2,
    status: 'answered',
    receiptOrigin: 'native',
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    seed: 'seed-1',
    parameters: {},
    generatorFingerprint: 'variant-1',
    renderedPrompt: 'Solve.',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    renderedExplanation: 'Worked answer.',
    submittedAnswer: '1',
    marksEarned: 1,
    marksAvailable: 1,
    grade: 3,
    scheduleEffect: { kind: 'replay', grade: 3 },
    sessionId: 'session-1',
  };
}

function records(course: Course) {
  const now = Date.now();
  const card = (id: string, lessonId: string, reviewed: boolean) =>
    makeCard({
      id,
      deckId: course.id,
      courseId: course.id,
      primaryLessonId: lessonId,
      ...(reviewed
        ? {
            state: 2 as const,
            lastReviewed: now - MS_PER_DAY,
            stability: 20,
            due: now + 19 * MS_PER_DAY,
          }
        : {}),
    });
  return {
    course,
    lessons: [
      makeLesson({ id: 'a', courseId: course.id, name: 'Cells', orderIndex: 0 }),
      makeLesson({ id: 'b', courseId: course.id, name: 'Enzymes', orderIndex: 1 }),
    ],
    cards: [card('a1', 'a', true), card('a2', 'a', false), card('b1', 'b', true)],
    assessments: [
      makeExamDate({
        id: 'near',
        courseId: course.id,
        name: 'Topic test',
        examDate: now + 3 * MS_PER_DAY,
        lessonIds: ['a'],
      }),
      makeExamDate({
        id: 'final',
        courseId: course.id,
        name: 'Final paper',
        kind: 'final',
        examDate: now + 60 * MS_PER_DAY,
      }),
    ],
    links: [],
    exposures: [],
    concepts: [],
  };
}

describe('CourseAnalytics', () => {
  beforeEach(() => {
    mocks.course = makeCourse({
      id: 'course-1',
      name: 'Mathematics',
      examDate: Date.now() + 60 * MS_PER_DAY,
    });
    mocks.records = records(mocks.course);
  });

  it('renders Question evidence separately with novel generated performance as the headline', () => {
    const question = generatedQuestion();
    mocks.questionData = {
      questions: [question],
      conceptSets: [],
      concepts: [],
      attempts: [novelAttempt()],
    };
    render(
      <MemoryRouter initialEntries={['/course/course-1/analytics']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/course/:courseId/analytics"
              element={
                <>
                  <CourseSectionNavigation courseId="course-1" />
                  <CourseAnalytics />
                </>
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Marks earned: 100%' })).toBeInTheDocument();
    expect(screen.getByText(/a topic without marked answers is not a gap/)).toBeInTheDocument();
    expect(screen.getByText(/This is predicted recall, not a mark or grade/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Question details' }));
    const generatedHeadline = screen.getByText('Novel generated accuracy').parentElement;
    expect(generatedHeadline).not.toBeNull();
    expect(within(generatedHeadline!).getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/not included in Card readiness/)).not.toBeInTheDocument();
    expect(screen.queryByText('Separate evidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Memory evidence')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Question performance' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Questions' })).toHaveLength(1);
    const cards = screen.getByRole('button', { name: 'Cards' });
    expect(screen.queryByText('Card analytics charts')).not.toBeInTheDocument();
    fireEvent.click(cards);
    expect(cards).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Card analytics charts')).toBeInTheDocument();
  });

  it('scopes the overview, forecast, question evidence and next action to a selected assessment', async () => {
    mocks.questionData = { questions: [], conceptSets: [], concepts: [], attempts: [] };
    render(
      <MemoryRouter initialEntries={['/course/course-1/analytics']}>
        <ToastProvider>
          <Routes>
            <Route path="/course/:courseId/analytics" element={<CourseAnalytics />} />
            <Route path="/course/:courseId/study" element={<p>Study opened</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    const whole = screen.getByRole('region', { name: 'Whole course' });
    expect(within(whole).getByRole('img', { name: 'Cards: 3' })).toBeInTheDocument();
    expect(whole).toHaveTextContent('Reviewed at least once:2');
    expect(whole).toHaveTextContent('Each card is measured at its next test or paper.');
    // Cards target two dates, so no single exam-day line is drawn; each paper gets a row.
    expect(screen.queryByText('Exam-day forecast')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise for/ })).not.toBeInTheDocument();
    const papers = screen.getByRole('region', { name: 'Forecast by paper' });
    expect(within(papers).getAllByRole('row')).toHaveLength(3);
    expect(papers).toHaveTextContent('3 cards in total, matching the headline.');

    fireEvent.click(within(papers).getByRole('button', { name: 'Show Topic test' }));
    const scoped = screen.getByRole('region', { name: 'Topic test' });
    expect(screen.queryByRole('region', { name: 'Forecast by paper' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Show')).toHaveFocus();
    const evidence = await screen.findByRole('list', { name: 'Exam-question evidence' });
    expect(within(evidence).getByRole('listitem')).toHaveTextContent(
      'Knowledge: 1 secure, 1 gap, 1 topic to work on',
    );
    expect(
      screen.getByRole('img', { name: '1 of 1 topic has marked answers' }),
    ).toBeInTheDocument();
    expect(scoped).toHaveTextContent('1 of 2');
    expect(scoped).toHaveTextContent('(in 3 days) if you stop reviewing now.');
    expect(screen.getByText('Exam-day forecast')).toBeInTheDocument();
    const questions = screen.getByRole('heading', { name: 'Questions' });
    expect(
      scoped.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(within(scoped).getByRole('button', { name: 'Revise for Topic test' }));
    expect(screen.getByText('Study opened')).toBeInTheDocument();
  });

  it('keeps archived analytics read-only without active-course navigation', () => {
    mocks.course = { ...mocks.course, archived: true };
    mocks.records = records(mocks.course);
    mocks.questionData = { questions: [], conceptSets: [], concepts: [], attempts: [] };

    render(
      <MemoryRouter initialEntries={['/course/course-1/analytics']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/course/:courseId/analytics"
              element={
                <>
                  <CourseSectionNavigation courseId="course-1" />
                  <CourseAnalytics />
                </>
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Archived course')).toBeInTheDocument();
    expectAppDestination(screen.getByRole('link', { name: 'Archived courses' }), '/archived');
    expect(screen.queryByText('Course tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
  });
});
