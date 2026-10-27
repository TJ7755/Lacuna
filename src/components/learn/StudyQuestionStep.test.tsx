import 'fake-indexeddb/auto';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import { db } from '../../db/schema';
import { createQuestionSet } from '../../questions/questionSetRepository';
import { getQuestionSetAttempt } from '../../questions/questionSetAttemptRepository';
import { StudyQuestionStep } from './StudyQuestionStep';
import {
  beginStudyTransition,
  hasLandingArrival,
  releaseStudyCover,
} from '../layout/LandingTransition';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
  getMotionMultiplier: () => 1,
}));

beforeEach(async () => {
  releaseStudyCover();
  db.close();
  await db.delete();
  await db.open();
});

it('saves and resumes an embedded question, then hands back only after a durable manual mark', async () => {
  const course = await createCourse('Biology');
  const card = await createCourseCard(
    course.id,
    'front_back',
    'What does the cell membrane do?',
    'It controls which substances enter and leave the cell.',
  );
  const conceptId = card.conceptId!;
  const set = await createQuestionSet({
    id: 'membrane-set',
    courseId: course.id,
    title: 'Cell membranes',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'membrane',
        prompt: 'Describe the function of the cell membrane.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'selective-permeability',
              criterion: 'Controls movement of substances into and out of the cell.',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [conceptId],
            },
          ],
        },
      },
    ],
  });
  const onComplete = vi.fn();
  const onExit = vi.fn();
  function open() {
    beginStudyTransition(
      new DOMRect(0, 0, 200, 48),
      { colour: '#111', radius: '24px', paper: '#fff' },
      vi.fn(),
    );
    expect(hasLandingArrival()).toBe(true);
    const router = createMemoryRouter(
      [
        {
          path: '/course/:courseId/study',
          element: (
            <StudyQuestionStep
              courseId={course.id}
              conceptId={conceptId}
              scopeConceptIds={[conceptId]}
              onComplete={onComplete}
              onExit={onExit}
            />
          ),
        },
      ],
      { initialEntries: [`/course/${course.id}/study`] },
    );
    return {
      ...render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      ),
      router,
    };
  }

  const first = open();
  const answer = await screen.findByLabelText('Your answer');
  expect(hasLandingArrival()).toBe(false);
  fireEvent.change(answer, {
    target: { value: 'Controls which substances enter and leave.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and finish later' }));
  await waitFor(() => expect(onExit).toHaveBeenCalledOnce());
  const [saved] = await db.questionSetAttempts.toArray();
  expect(saved.responses[0].draft).toEqual({
    kind: 'written',
    text: 'Controls which substances enter and leave.',
  });
  expect(saved.status).toBe('answering');
  expect(onComplete).not.toHaveBeenCalled();
  first.unmount();
  first.router.dispose();

  const resumed = open();
  expect(await screen.findByLabelText('Your answer')).toHaveValue(
    'Controls which substances enter and leave.',
  );
  expect(hasLandingArrival()).toBe(false);
  expect(await db.questionSetAttempts.count()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Submit question' }));
  await screen.findByText('Controls movement of substances into and out of the cell.');
  expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeDisabled();
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: '1 / 1' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Finish attempt' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());

  const complete = await getQuestionSetAttempt(saved.id);
  expect(complete).toMatchObject({
    questionSetId: set.id,
    status: 'complete',
    decisions: [{ allocationId: 'selective-permeability', status: 'awarded', marks: 1 }],
    firstMarking: [
      {
        questionId: 'membrane',
        decisions: [{ allocationId: 'selective-permeability', status: 'awarded', marks: 1 }],
      },
    ],
  });
  expect(onComplete).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'question',
      marking: 'Self-marked',
      score: expect.objectContaining({ status: 'complete', total: { awarded: 1, available: 1 } }),
    }),
  );
  expect(await db.cards.get(card.id)).toEqual(card);
  expect(await db.reviewHistory.count()).toBe(0);
  expect(await db.sessionHistory.count()).toBe(0);
  expect(resumed.router.state.location.pathname).toBe(`/course/${course.id}/study`);
});
