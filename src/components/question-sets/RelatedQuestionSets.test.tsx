import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard, createLesson } from '../../db/repository';
import { createCourseAssessment } from '../../db/assessmentRepository';
import { db } from '../../db/schema';
import { createQuestionSet } from '../../questions/questionSetRepository';
import type { QuestionSet } from '../../questions/questionSets';
import { createConcept } from '../../questions/repository';
import { RelatedQuestionSets } from './RelatedQuestionSets';

let setNumber = 0;

function renderAt(
  courseId: string,
  props: { lessonId?: string; assessmentId?: string; cardId?: string },
  initialEntry = `/course/${courseId}/lesson/lesson-1?tab=cards`,
) {
  const onNavigate = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: <RelatedQuestionSets courseId={courseId} {...props} onNavigate={onNavigate} />,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  const rendered = render(<RouterProvider router={router} />);
  return { onNavigate, router, container: rendered.container };
}

async function makeSet(courseId: string, overrides: Partial<QuestionSet> = {}) {
  return createQuestionSet(
    {
      id: `set-${++setNumber}`,
      courseId,
      title: 'Cell structure questions',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'question-1',
          prompt: 'Describe a cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-1',
                criterion: 'A valid description.',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
      ...overrides,
    },
    100,
  );
}

describe('RelatedQuestionSets', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    setNumber = 0;
    db.close();
    await db.delete();
    await db.open();
  });

  it('renders lesson-linked sets with the lesson return state and callback', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const set = await makeSet(course.id, { lessonIds: [lesson.id] });
    const { onNavigate, router } = renderAt(course.id, { lessonId: lesson.id });

    expect(await screen.findByRole('heading', { name: 'Practice questions' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: set.title });
    expect(link).toHaveAttribute('href', `/course/${course.id}/question-sets/${set.id}`);
    fireEvent.click(link);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(onNavigate).toHaveBeenCalledWith();
    expect(router.state.location.state).toEqual({
      questionSetReturnTo: '/course/' + course.id + '/lesson/lesson-1?tab=cards',
      questionSetReturnLabel: 'Back to lesson',
    });
  });

  it('uses exam and card repository relationships with the matching return labels', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const assessment = await createCourseAssessment(course.id, 'Mock exam', Date.now(), {
      coverageMode: 'custom',
      lessonIds: [lesson.id],
    });
    const concept = await createConcept(course.id, 'Cell structure');
    const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
    await db.cards.update(card.id, { conceptId: concept.id });
    const set = await makeSet(course.id, {
      assessmentIds: [assessment.id],
      questions: [
        {
          id: 'question-1',
          prompt: 'Describe a cell.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-1',
                criterion: 'A valid description.',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [concept.id],
              },
            ],
          },
        },
      ],
    });
    const cardBeforeNavigation = await db.cards.get(card.id);

    const examView = renderAt(
      course.id,
      { assessmentId: assessment.id },
      `/course/${course.id}/study?assessmentId=${assessment.id}`,
    );
    expect(await screen.findByRole('link', { name: set.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: set.title }));
    await waitFor(() => expect(examView.router.state.location.state).not.toBeNull());
    expect(examView.router.state.location.state).toEqual({
      questionSetReturnTo: `/course/${course.id}/study?assessmentId=${assessment.id}&exam=${assessment.id}`,
      questionSetReturnLabel: 'Back to exam',
    });
    cleanup();
    examView.router.dispose();

    const cardView = renderAt(course.id, { cardId: card.id }, `/course/${course.id}/cards/${card.id}`);
    expect(await screen.findByRole('link', { name: set.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: set.title }));
    await waitFor(() => expect(cardView.router.state.location.state).toEqual({
      questionSetReturnTo: `/course/${course.id}/cards/${card.id}`,
      questionSetReturnLabel: 'Back to Cards',
    }));
    expect(await db.cards.get(card.id)).toEqual(cardBeforeNavigation);
  });

  it('renders nothing when the relationship has no sets', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const { container } = renderAt(course.id, { lessonId: lesson.id });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('heading', { name: 'Practice questions' })).not.toBeInTheDocument();
  });
});
