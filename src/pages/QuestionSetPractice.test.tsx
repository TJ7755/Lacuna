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

// Browser tests exercise motion; component tests keep focus and persistence deterministic.
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

async function fixture(single = false, multipleChoice = false) {
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

function open(
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

async function answerAndAdvance(value: string, nextHeading: string) {
  fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value } });
  await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
  const next = screen.getByRole('button', { name: 'Next' });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);
  await screen.findByRole('heading', { name: nextHeading });
  await waitFor(() => expect(screen.getByLabelText('Your answer')).not.toHaveAttribute('readonly'));
}

describe('QuestionSetPractice', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('keeps practice progression inside the card without submission captions or saved chrome', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByRole('textbox', { name: 'Your answer' });
    const card = answer.closest('article')!;
    const primary = screen.getByRole('button', { name: 'Next part' });
    expect(card).toContainElement(primary);
    expect(card).toContainElement(screen.getByRole('navigation', { name: 'Answer parts' }));
    const earlySubmit = screen.getByRole('button', { name: 'Submit question' });
    expect(card).toContainElement(earlySubmit);
    expect(earlySubmit).not.toHaveAttribute('data-attempt-primary');
    expect(primary).toHaveAttribute('data-attempt-primary');
    expect(
      screen.queryByText('Submit all parts of this question before opening its mark scheme.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    const stepper = screen.getByRole('button', { name: 'Practice, part 1 of 3' });
    expect(stepper).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(stepper);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Q1 (b)' }));
    await screen.findByRole('heading', { name: 'Q1 (b)' });
    const submit = screen.getByRole('button', { name: 'Submit question' });
    expect(submit).toHaveAttribute('data-attempt-primary');
    expect(submit.closest('article')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Next part' })).not.toBeInTheDocument();
  });

  it('focuses the answer and progresses with Ctrl+Enter without submitting the paper early', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(answer).toHaveFocus());
    fireEvent.change(answer, { target: { value: 'Answer one' } });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    await screen.findByRole('heading', { name: 'Q1 (b)' });
    await waitFor(() => expect(screen.getByLabelText('Your answer')).toHaveFocus());
    expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('answering');
    expect(screen.queryByText('Controls cell activities.')).not.toBeInTheDocument();
  });

  it('preserves focus deliberately moved while the next part is being saved', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(answer).toHaveFocus());
    const original = attemptRepository.saveQuestionSetAttemptPosition;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi
      .spyOn(attemptRepository, 'saveQuestionSetAttemptPosition')
      .mockImplementationOnce(async (...args) => {
        await pending;
        return original(...args);
      });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(save).toHaveBeenCalled());
    const other = screen.getByRole('button', { name: 'Save and finish later' });
    other.focus();
    release();
    await screen.findByRole('heading', { name: 'Q1 (b)' });
    await waitFor(() =>
      expect(screen.getByLabelText('Your answer')).not.toHaveAttribute('readonly'),
    );
    expect(other).toHaveFocus();
  });

  it('uses the primary chord to submit and focus manual marks, then advance and complete', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    const answer = screen.getByLabelText('Your answer');
    fireEvent.change(answer, { target: { value: 'Answer three' } });
    fireEvent.keyDown(answer, { key: 'Enter', metaKey: true });
    await screen.findByRole('radio', { name: 'Not marked' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Not marked' })).toHaveFocus());
    const unmarked = screen.getByRole('radio', { name: 'Not marked' });
    fireEvent.keyDown(unmarked, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: /criterion 1 of 3/ })).toBeInTheDocument();
    for (const count of [1, 2, 3]) {
      const award = screen.getByRole('radio', { name: '1 / 1' });
      fireEvent.click(award);
      await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
      fireEvent.keyDown(award, { key: 'Enter', ctrlKey: true });
      if (count < 3) {
        await screen.findByRole('button', { name: new RegExp(`criterion ${count + 1} of 3`) });
        await waitFor(() =>
          expect(screen.getByRole('radio', { name: 'Not marked' })).toHaveFocus(),
        );
      }
    }
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('complete'),
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'Back to set →' })).toHaveFocus());
  });

  it('ignores composing and consumed chords and keeps blank submission explicit', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true, isComposing: true });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true, keyCode: 229 });
    const consumed = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    consumed.preventDefault();
    fireEvent(answer, consumed);
    expect(screen.getByRole('heading', { name: 'Q1 (a)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    const confirm = await screen.findByRole('button', { name: 'Submit unanswered' });
    fireEvent.keyDown(confirm, { key: 'Enter', ctrlKey: true });
    expect(confirm).toBeInTheDocument();
    expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('answering');
  });

  it('simplifies a single part and criterion and guards unfinished notes and corrections', async () => {
    const { course, set } = await fixture(true);
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    expect(screen.queryByRole('button', { name: 'All parts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Answer parts' })).not.toBeInTheDocument();
    fireEvent.change(answer, { target: { value: 'Original answer.' } });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    const award = await screen.findByRole('radio', { name: '1 / 1' });
    expect(screen.getByText('1 criterion remaining')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Marking criteria' })).not.toBeInTheDocument();
    fireEvent.click(award);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finish attempt' })).not.toBeDisabled(),
    );
    const addNote = screen.getByRole('button', { name: 'Add note' });
    addNote.focus();
    fireEvent.click(addNote);
    const note = screen.getByLabelText('Note');
    fireEvent.change(note, { target: { value: 'Unfinished note' } });
    fireEvent.keyDown(note, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(addNote).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }));
    const correction = screen.getByRole('textbox', { name: 'Correction' });
    fireEvent.change(correction, { target: { value: 'Unfinished correction' } });
    fireEvent.keyDown(correction, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(correction, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Correction' })).toBeInTheDocument();
    expect(correction).toHaveValue('Unfinished correction');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel correction' }));
    expect(correction).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect((await getQuestionSetAttempt(attempt.id))?.status).not.toBe('complete');
  });

  it('focuses the restored selected multiple-choice answer and still requires a manual mark', async () => {
    const { course, set } = await fixture(true, true);
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    const view = open(course.id, set.id, attempt.id);
    const choice = await screen.findByRole('radio', { name: 'A. Selectively permeable' });
    await waitFor(() => expect(choice).toHaveFocus());
    fireEvent.click(screen.getByRole('radio', { name: 'B. Impermeable' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.responses[0].draft).toEqual({
        kind: 'multiple-choice',
        selectedOptionIds: ['option-b'],
      }),
    );
    view.unmount();
    open(course.id, set.id, attempt.id);
    const restored = await screen.findByRole('radio', { name: 'B. Impermeable' });
    await waitFor(() => expect(restored).toHaveFocus());
    expect(restored).toBeChecked();
    fireEvent.keyDown(restored, { key: 'Enter', ctrlKey: true });
    await screen.findByRole('radio', { name: 'Not marked' });
    expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual([]);
    expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeDisabled();
  });

  it('flushes the answer before returning to the originating lesson', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    const view = open(course.id, set.id, attempt.id, {
      pathname: `/course/${course.id}/question-sets/${set.id}/attempts/${attempt.id}`,
      state: {
        questionSetReturnTo: `/course/${course.id}/lesson/lesson-1?tab=cards`,
        questionSetReturnLabel: 'Back to lesson',
      },
    });
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'A persisted response.' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    const save = screen.getByRole('button', { name: 'Save and finish later' });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(view.router?.state.location.pathname).toBe(`/course/${course.id}/lesson/lesson-1`),
    );
    expect(view.router?.state.location.search).toBe('?tab=cards');
    expect((await getQuestionSetAttempt(attempt.id))?.responses[0].draft).toEqual({
      kind: 'written',
      text: 'A persisted response.',
    });
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
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Answer three' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
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

  it('returns a cancelled blank confirmation to the remounted submission control', async () => {
    const { course, set } = await fixture(true);
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    open(course.id, set.id, attempt.id);
    const submit = await screen.findByRole('button', { name: 'Submit question' });
    submit.focus();
    fireEvent.click(submit);
    const cancel = await screen.findByRole('button', { name: /^Cancel$/ });
    await waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit question' })).toHaveFocus(),
    );
    expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('answering');
  });

  it('keeps deliberate focus when a pending save reveals blank-answer confirmation', async () => {
    const { course, set } = await fixture(true);
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    const answer = await screen.findByLabelText('Your answer');
    const original = attemptRepository.saveQuestionSetResponseDraft;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi
      .spyOn(attemptRepository, 'saveQuestionSetResponseDraft')
      .mockImplementationOnce(async (...args) => {
        await pending;
        return original(...args);
      });
    fireEvent.change(answer, { target: { value: ' ' } });
    const submit = screen.getByRole('button', { name: 'Submit paper' });
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() => expect(save).toHaveBeenCalled());
    const other = screen.getByRole('button', { name: 'Save and finish later' });
    other.focus();
    release();
    await screen.findByRole('button', { name: 'Submit unanswered' });
    expect(other).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    await screen.findByRole('button', { name: 'Submit paper' });
    expect(other).toHaveFocus();
  });

  it('keeps marking unresolved until every criterion is awarded, including explicit zero', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Answer three' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'),
    );
    const award = await screen.findByRole('radio', { name: '0 / 1' });
    expect(award).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Not marked' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '0 / 1' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '1 / 1' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Unsure' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Finish attempt' })).toBeDisabled();
    expect(screen.getByText(/3 criteria remaining/i)).toBeInTheDocument();
    fireEvent.click(award);
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a1', status: 'awarded', marks: 0 }]),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /next criterion/i }));
    await screen.findByRole('button', { name: /criterion 2 of 3/ });
    fireEvent.click(screen.getByRole('radio', { name: '1 / 1' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a2', status: 'awarded', marks: 1 }]),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /next criterion/i }));
    await screen.findByRole('button', { name: /criterion 3 of 3/ });
    fireEvent.click(screen.getByRole('radio', { name: '1 / 1' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a3', status: 'awarded', marks: 1 }]),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finish attempt' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish attempt' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.status).toBe('complete'),
    );
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
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Answer three' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await screen.findByText('Controls cell activities.');
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'),
    );
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
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Answer three' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    await screen.findByText('Controls cell activities.');
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.activeAllocationId).toBe('a1'),
    );

    vi.spyOn(attemptRepository, 'saveQuestionSetMarking').mockRejectedValueOnce(
      new Error('Offline'),
    );
    fireEvent.click(screen.getByRole('radio', { name: '0 / 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByRole('radio', { name: '0 / 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual(
        expect.arrayContaining([{ allocationId: 'a1', status: 'awarded', marks: 0 }]),
      ),
    );
    expect(screen.getByRole('radio', { name: '0 / 1' })).not.toBeDisabled();
  });

  it('Practice submits all parts of the current question, then preserves the original while correcting', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Original one', 'Q1 (b)');
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Original two' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    fireEvent.click(screen.getByRole('button', { name: 'Submit question' }));
    expect(await screen.findByText('Controls cell activities.')).toBeInTheDocument();
    expect(screen.queryByText('Describes selective permeability.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Correction' }), {
      target: { value: 'Improved' },
    });
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
    expect(persisted?.responses.find((response) => response.nodeId === 'q1-a')?.submitted).toEqual({
      kind: 'written',
      text: 'Original one',
    });
  });
});
