import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCourse } from '../../db/repository';
import { db } from '../../db/schema';
import { deleteQuestionSet, createQuestionSet } from '../../questions/questionSetRepository';
import { startQuestionSetAttempt } from '../../questions/questionSetAttemptRepository';
import type { QuestionSet } from '../../questions/questionSets';
import { RemovedQuestionSetAttempts } from './RemovedQuestionSetAttempts';

function setContent(courseId: string): QuestionSet {
  return {
    id: 'removed-set',
    courseId,
    title: 'Cell structure',
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
              criterion: 'Describes a cell.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
  };
}

function AttemptRoute() {
  const location = useLocation();
  return (
    <output aria-label="Attempt route state">
      {JSON.stringify({
        pathname: location.pathname,
        state: location.state,
      })}
    </output>
  );
}

describe('RemovedQuestionSetAttempts', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });
  afterEach(cleanup);

  it('links to the pinned attempt and carries the filtered Questions library return location', async () => {
    const course = await createCourse('Biology');
    const set = await createQuestionSet(setContent(course.id), 100);
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    await deleteQuestionSet(set.id, 300);

    const router = createMemoryRouter(
      [
        {
          path: '/course/:courseId/questions',
          element: (
            <>
              <RemovedQuestionSetAttempts courseId={course.id} />
              <p>Questions library</p>
            </>
          ),
        },
        {
          path: '/course/:courseId/question-sets/:setId/attempts/:attemptId',
          element: <AttemptRoute />,
        },
      ],
      { initialEntries: [`/course/${course.id}/questions?q=kinetics`] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Attempts from removed sets · 1')).toBeInTheDocument();
    const title = await screen.findByRole('heading', { name: 'Cell structure' });
    const link = title.closest('a');
    expect(link).toHaveAttribute(
      'href',
      `/course/${course.id}/question-sets/${set.id}/attempts/${attempt.id}`,
    );
    link?.click();

    await waitFor(() =>
      expect(screen.getByLabelText('Attempt route state')).toHaveTextContent(
        JSON.stringify({
          pathname: `/course/${course.id}/question-sets/${set.id}/attempts/${attempt.id}`,
          state: {
            questionSetReturnTo: `/course/${course.id}/questions?q=kinetics`,
            questionSetReturnLabel: 'Back to Questions',
          },
        }),
      ),
    );
  });
});
