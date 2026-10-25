import { fixture, open, setupQuestionSetPracticeTests } from './QuestionSetPractice.testSupport';
import 'fake-indexeddb/auto';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getQuestionSetAttempt,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import * as attemptRepository from '../questions/questionSetAttemptRepository';

describe('QuestionSetPractice attempt loading', () => {
  setupQuestionSetPracticeTests();

  it('retries a failed attempt load without losing a saved answer', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    await attemptRepository.saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      'q1-a',
      { kind: 'written', text: 'Keep this answer' },
      'q1-a',
    );
    vi.spyOn(attemptRepository, 'getQuestionSetAttempt').mockRejectedValueOnce(
      new Error('Attempt transaction refused'),
    );
    open(course.id, set.id, attempt.id);

    const failureHeading = await screen.findByRole('heading', {
      name: 'Could not open this attempt',
    });
    await waitFor(() => expect(failureHeading).toHaveFocus());
    expect(screen.getByText(/Attempt transaction refused/)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Your answer')).toHaveValue('Keep this answer');
    await waitFor(() => expect(screen.getByLabelText('Your answer')).toHaveFocus());
    expect((await getQuestionSetAttempt(attempt.id))?.responses[0].draft).toEqual({
      kind: 'written',
      text: 'Keep this answer',
    });
  });

  it('keeps a later navigation focus choice when a slow retry succeeds', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
    let finish!: () => void;
    vi.spyOn(attemptRepository, 'getQuestionSetAttempt')
      .mockRejectedValueOnce(new Error('Attempt transaction refused'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(attempt);
          }),
      );
    open(course.id, set.id, attempt.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    const navigation = document.createElement('button');
    navigation.textContent = 'Persistent navigation';
    document.body.append(navigation);
    try {
      navigation.focus();
      await act(async () => finish());
      await screen.findByLabelText('Your answer');
      expect(navigation).toHaveFocus();
    } finally {
      navigation.remove();
    }
  });

  it('offers a return action for a missing attempt without pretending it is still loading', async () => {
    const { course, set } = await fixture();
    const { router } = open(course.id, set.id, 'missing');
    await screen.findByRole('heading', { name: 'Attempt not found' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Attempt not found' })).toHaveFocus(),
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Back to question set' }));
    expect(router.state.location.pathname).toBe(`/course/${course.id}/question-sets/${set.id}`);
  });
});
