import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import type { QuestionAttempt, QuestionDefinition } from '../questions/types';
import { CourseAnalytics } from './CourseAnalytics';

const mocks = vi.hoisted(() => ({
  questionData: undefined as CourseQuestionData | undefined,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => ({ id: 'course-1', name: 'Mathematics' }),
  useLessons: () => [],
  useCourseCards: () => [],
  useCourseReviewHistory: () => [],
  useCourseSessionHistory: () => [],
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.questionData,
}));

vi.mock('../components/analytics/CourseAnalytics', () => ({
  CourseAnalytics: () => <div>Card analytics charts</div>,
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

describe('CourseAnalytics', () => {
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
        <Routes>
          <Route path="/course/:courseId/analytics" element={<CourseAnalytics />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    const generatedHeadline = screen.getByText('Novel generated accuracy').parentElement;
    expect(generatedHeadline).not.toBeNull();
    expect(within(generatedHeadline!).getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(/not included in Card readiness/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByText('Card analytics charts')).toBeInTheDocument();
  });
});
