import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { createCourse } from '../db/repository';
import { db } from '../db/schema';
import { createQuestionSet } from '../questions/questionSetRepository';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { QuestionSetPractice } from './QuestionSetPractice';

// Browser tests exercise motion; component tests keep focus and persistence deterministic.
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

export async function fixture(single = false, multipleChoice = false) {
  const course = await createCourse('Biology');
  const content: QuestionSet = {
    id: 'paper-set',
    courseId: course.id,
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Describe the nucleus.',
        parts: [
          {
            id: 'q1-a',
            prompt: 'State its role.',
            subparts: [],
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'a1',
                  criterion: 'Controls cell activities.',
                  maxMarks: 1,
                  dimension: 'knowledge',
                  targetConceptIds: [],
                },
              ],
            },
          },
          {
            id: 'q1-b',
            prompt: 'Explain why it matters.',
            subparts: [],
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'a2',
                  criterion: 'Explains its importance.',
                  maxMarks: 1,
                  dimension: 'application',
                  targetConceptIds: [],
                },
              ],
            },
          },
        ],
      },
      {
        id: 'q2',
        prompt: 'Describe the cell membrane.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'a3',
              criterion: 'Describes selective permeability.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
  };
  if (single) content.questions = [content.questions[1]];
  if (multipleChoice)
    content.questions[0].answer!.response = {
      kind: 'multiple-choice',
      selection: 'single',
      options: [
        { id: 'option-a', content: 'Selectively permeable' },
        { id: 'option-b', content: 'Impermeable' },
      ],
      correctOptionIds: ['option-a'],
    };
  const set = await createQuestionSet(content, 100);
  return { course, set };
}

export function open(
  courseId: string,
  setId: string,
  attemptId: string,
  origin?: { pathname: string; search?: string; state?: unknown },
) {
  const router = createMemoryRouter(
    [
      {
        path: '/course/:courseId/question-sets/:setId/attempts/:attemptId',
        element: <QuestionSetPractice />,
      },
    ],
    {
      initialEntries: [
        origin ?? `/course/${courseId}/question-sets/${setId}/attempts/${attemptId}`,
      ],
    },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

export async function answerAndAdvance(value: string, nextHeading: string) {
  fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value } });
  const next = screen.getByRole('button', { name: 'Next' });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);
  await screen.findByRole('heading', { name: nextHeading });
  await waitFor(() => expect(screen.getByLabelText('Your answer')).not.toHaveAttribute('readonly'));
}

export function setupQuestionSetPracticeTests() {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });
}
