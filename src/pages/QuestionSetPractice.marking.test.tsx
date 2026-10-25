import {
  fixture,
  open,
  answerAndAdvance,
  setupQuestionSetPracticeTests,
} from './QuestionSetPractice.testSupport';
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getQuestionSetAttempt,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import { jevEngine } from '../jev/engine';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';
import * as attemptRepository from '../questions/questionSetAttemptRepository';

describe('QuestionSetPractice marking', () => {
  setupQuestionSetPracticeTests();

  it('reveals the Paper mark scheme only after submitting the paper', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    await answerAndAdvance('Answer one', 'Q1 (b)');
    await answerAndAdvance('Answer two', 'Q2');
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Answer three' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit paper' }));
    expect(await screen.findByText('Controls cell activities.')).toBeInTheDocument();
  });

  it.each(['paper', 'practice'] as const)(
    'requests only the displayed first criterion when submitting %s from a later part',
    async (mode) => {
      const { course, set } = await fixture();
      let attempt = await startQuestionSetAttempt(set.id, mode, 200);
      for (const nodeId of ['q1-a', 'q1-b', 'q2']) {
        attempt = await attemptRepository.saveQuestionSetResponseDraft(
          attempt.id,
          attempt.revisionId,
          nodeId,
          { kind: 'written', text: `My ${mode} answer` },
          mode === 'paper' ? nodeId : 'q1-b',
        );
      }
      const requested: string[] = [];
      const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/session'))
          return Response.json({ token: 'session', expiresAt: Date.now() + 60_000 });
        const { allocations } = JSON.parse(String(init?.body));
        requested.push(...allocations.map((row: { criterion: string }) => row.criterion));
        return Response.json({
          model: 'jev-1.14.0',
          inputTokens: 20,
          decisions: allocations.map(() => ({ model: 'jev-1.14.0', value: 1, confidence: 0.98 })),
        });
      });
      vi.stubGlobal('fetch', fetcher);
      localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
      jevEngine.enable(1);
      try {
        open(course.id, set.id, attempt.id);
        await screen.findByRole('heading', { name: mode === 'paper' ? 'Q2' : 'Q1 (b)' });
        fireEvent.click(
          screen.getByRole('button', {
            name: mode === 'paper' ? 'Submit paper' : 'Submit question',
          }),
        );
        await screen.findByText('Controls cell activities.');
        await waitFor(async () =>
          expect((await getQuestionSetAttempt(attempt.id))?.decisions.length).toBeGreaterThan(0),
        );
        expect(requested).toEqual(['Controls cell activities.']);
        expect((await getQuestionSetAttempt(attempt.id))?.decisions).toEqual([
          expect.objectContaining({ allocationId: 'a1' }),
        ]);
      } finally {
        cleanup();
        jevEngine.disable();
        localStorage.clear();
        vi.unstubAllGlobals();
      }
    },
  );

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
