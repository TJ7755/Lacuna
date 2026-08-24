import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import type { QuestionDefinition } from '../questions/types';
import { QuestionsPage } from './QuestionsPage';

const mocks = vi.hoisted(() => ({
  data: undefined as CourseQuestionData | undefined,
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.data,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => ({ id: 'course-1', name: 'Mathematics' }),
  useLessons: () => [],
}));

vi.mock('../components/course/CourseTabs', () => ({
  CourseTabs: () => <nav>Course tabs</nav>,
}));

vi.mock('../components/items/BatchAuthoringPromptDialog', () => ({
  BatchAuthoringPromptDialog: ({ questions }: { questions: QuestionDefinition[] }) => (
    <div role="dialog" aria-label="Generate Question batch">
      {questions.length} existing Question
    </div>
  ),
}));

function definition(): QuestionDefinition {
  return {
    id: 'question-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Quadratic application',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt: 'Solve it.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    explanation: 'Worked answer.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'revision-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: 1,
    scheduleEpoch: { id: 'epoch-1', startedAt: 1, reason: 'created', baseline: { kind: 'new' } },
    stability: 1,
    difficulty: 5,
    lastReviewed: 1,
    reps: 1,
    lapses: 0,
    state: 2,
    due: 1,
    scheduledDays: 1,
    learningSteps: 0,
    scheduleUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('QuestionsPage', () => {
  it('offers the independent default-ten and All-due Question sessions', async () => {
    const question = definition();
    mocks.data = {
      questions: [question],
      conceptSets: [
        {
          questionId: question.id,
          courseId: question.courseId,
          targetConceptIds: ['concept-1'],
          prerequisiteConceptIds: [],
          authoringRevisionId: question.authoringRevisionId,
          authoringUpdatedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      concepts: [
        {
          id: 'concept-1',
          scope: 'course',
          scopeKey: 'course:course-1',
          courseId: 'course-1',
          name: 'Solving quadratics',
          provisional: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      attempts: [],
    };

    render(
      <MemoryRouter initialEntries={['/course/course-1/questions']}>
        <Routes>
          <Route path="/course/:courseId/questions" element={<QuestionsPage />} />
          <Route path="/course/:courseId/questions/learn" element={<p>Question session</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(screen.getByText('Primary skill practised: Solving quadratics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All due/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Build batch prompt' }));
    expect(screen.getByRole('dialog', { name: 'Generate Question batch' })).toHaveTextContent(
      '1 existing Question',
    );
    fireEvent.click(screen.getByRole('button', { name: /Practise 10/ }));
    expect(await screen.findByText('Question session')).toBeInTheDocument();
  });
});
