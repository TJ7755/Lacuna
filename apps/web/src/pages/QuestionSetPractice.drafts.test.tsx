import { fixture, open, setupQuestionSetPracticeTests } from './QuestionSetPractice.testSupport';
import 'fake-indexeddb/auto';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getQuestionSetAttempt,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import * as attemptRepository from '../questions/questionSetAttemptRepository';

describe('QuestionSetPractice drafts', () => {
  setupQuestionSetPracticeTests();

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

  it('saves a draft without routine saving chrome', async () => {
    const { course, set } = await fixture();
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
    fireEvent.change(answer, { target: { value: 'Quiet save.' } });
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    release();
    await waitFor(async () =>
      expect((await getQuestionSetAttempt(attempt.id))?.responses[0].draft).toEqual({
        kind: 'written',
        text: 'Quiet save.',
      }),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps a failed draft save visible and retryable', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
    open(course.id, set.id, attempt.id);
    vi.spyOn(attemptRepository, 'saveQuestionSetResponseDraft').mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );
    fireEvent.change(await screen.findByLabelText('Your answer'), {
      target: { value: 'Unsaved answer.' },
    });
    const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(alert).toHaveTextContent('Storage unavailable');
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument();
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
