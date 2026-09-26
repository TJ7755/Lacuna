import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../db/repository';
import { db } from '../db/schema';
import {
  getQuestionSetAttempt,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import * as attemptRepository from '../questions/questionSetAttemptRepository';
import { createQuestionSet } from '../questions/questionSetRepository';
import type { QuestionSet } from '../questions/questionSets';
import { QuestionSetPractice } from './QuestionSetPractice';

async function fixture() {
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
  const set = await createQuestionSet(content, 100);
  return { course, set };
}

function open(courseId: string, setId: string, attemptId: string) {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: '/course/:courseId/question-sets/:setId/attempts/:attemptId', element: <QuestionSetPractice /> }],
        { initialEntries: [`/course/${courseId}/question-sets/${setId}/attempts/${attemptId}`] },
      )}
    />,
  );
}

async function answerAndAdvance(value: string, nextHeading: string) {
  fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  const next = screen.getByRole('button', { name: 'Next' });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);
  await screen.findByRole('heading', { name: nextHeading });
}

describe('QuestionSetPractice', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('autosaves a Paper answer and restores it after remount without showing criteria early', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    const view = open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    fireEvent.change(answer, { target: { value: 'Controls the cell.' } });
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.responses[0].draft).toEqual({
        kind: 'written',
        text: 'Controls the cell.',
      }),
    );
    expect(screen.queryByText('Controls cell activities.')).not.toBeInTheDocument();
    view.unmount();
    open(course.id, set.id, attempt.id);
    expect(await screen.findByLabelText('Your answer')).toHaveValue('Controls the cell.');
  });

  it('reveals the Paper mark scheme only after submitting the paper', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'Answer three' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    expect(await screen.findByText('Controls cell activities.')).toBeInTheDocument();
  });

  it('requires explicit confirmation before submitting a blank Paper answer', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit paper' }));
    expect(await screen.findByRole('button', { name: 'Submit unanswered' })).toBeInTheDocument();
    expect(screen.queryByText('Controls cell activities.')).not.toBeInTheDocument();
  });

  it('keeps marking unresolved until every criterion is awarded, including explicit zero', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'Answer three' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'),
    );
    const award = await screen.findByLabelText('Marks awarded');
    expect(award).toHaveValue('');
    expect(screen.getByRole('option', { name: /^0/ })).toHaveValue('0');
    expect(screen.getByRole('option', { name: /^1/ })).toHaveValue('1');
    expect(screen.getByRole('option', { name: /unsure/i })).toHaveValue('unsure');
    expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeDisabled();
    expect(screen.getByText(/3 criteria remaining/i)).toBeInTheDocument();
    fireEvent.change(award, { target: { value: '0' } });
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a1', status: 'awarded', marks: 0 }]),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /next criterion/i }));
    await screen.findByText('Criterion 2 of 3');
    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '1' } });
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a2', status: 'awarded', marks: 1 }]),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /next criterion/i }));
    await screen.findByText('Criterion 3 of 3');
    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '1' } });
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a3', status: 'awarded', marks: 1 }]),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish attempt' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Finish attempt' }));
    await waitFor(async () => expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('complete'));
    expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
      expect.arrayContaining([{ allocationId: 'a1', status: 'awarded', marks: 0 }]),
    );
  });

  it('persists an Add note annotation and restores it after remount', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'Answer three' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await screen.findByText('Controls cell activities.');
    await waitFor(async () => expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'));
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Review this evidence.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.annotations).toEqual(
        expect.arrayContaining([expect.objectContaining({ comment: 'Review this evidence.' })]),
      ),
    );
    cleanup();
    open(course.id, set.id, attempt.id);
    expect(await screen.findByText('Review this evidence.')).toBeInTheDocument();
  });

  it('keeps a failed mark decision available for Retry and disables marking controls meanwhile', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'Answer three' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await screen.findByText('Controls cell activities.');
    await waitFor(async () => expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'));

    vi.spyOn(attemptRepository, 'saveQuestionSetMarking').mockRejectedValueOnce(new Error('Offline'));
    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '0' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('Marks awarded')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a1', status: 'awarded', marks: 0 }]),
      ),
    );
    expect(screen.getByLabelText('Marks awarded')).not.toBeDisabled();
  });

  it('Practice submits all parts of the current question, then preserves the original while correcting', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Original one', 'Q1 (b)');
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'Original two' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit question' }));
    expect(await screen.findByText('Controls cell activities.')).toBeInTheDocument();
    expect(screen.queryByText('Describes selective permeability.')).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Correction'), { target: { value: 'Improved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    let saved: Awaited<ReturnType<typeof getQuestionSetAttempt>> = null;
    await waitFor(async () => {
      saved = await getQuestionSetAttempt(attempt.id);
      expect(saved?.corrections).toEqual(
        expect.arrayContaining([
          { nodeId: 'q1-a', content: 'Improved', updatedAt: expect.any(Number) },
        ]),
      );
    });
    const persisted = await getQuestionSetAttempt(attempt.id);
    expect(persisted?.responses.find((response) => response.nodeId === 'q1-a')?.submitted).toEqual({ kind: 'written', text: 'Original one' });
  });
});
