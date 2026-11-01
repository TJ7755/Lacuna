import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from '../utils/drafts';
import { chooseConcept, mocks, renderEditor } from './QuestionEditor.testSupport';
import {
  EMPTY_QUESTION_AUTHORING_STATE,
  questionDraftKey,
  type QuestionDraftData,
} from './questionDraft';

describe('QuestionEditor drafts', () => {
  it('saves on Ctrl+Enter and readies another Question in the same Concept', async () => {
    const router = renderEditor();
    const prompt = await screen.findByLabelText('Prompt');
    fireEvent.change(prompt, { target: { value: 'What is 2 + 2?' } });
    fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Worked explanation'), {
      target: { value: 'Two pairs.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
      target: { value: 'Apply addition' },
    });
    chooseConcept();
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(mocks.createFixed).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByLabelText('Prompt')).toHaveValue(''));
    expect(router.state.location.pathname).toBe('/course/course-1/questions/new');
    expect(screen.getByPlaceholderText('Completing the square')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Primary skill practised' })).toHaveValue(
      'concept-1',
    );
    await waitFor(() => expect(screen.getByLabelText('Prompt')).toHaveFocus());
    expect(loadDraft(questionDraftKey('course-1'))).toBeNull();
  });

  it('flushes before the debounce, blocks navigation and retains the draft after Leave', async () => {
    const router = renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('Completing the square'), {
      target: { value: 'Unsaved definition' },
    });

    await act(() => router.navigate('/away'));

    const dialog = await screen.findByRole('dialog', { name: 'Leave this Question?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.name).toBe(
      'Unsaved definition',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(await screen.findByText('Other page')).toBeInTheDocument();
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.name).toBe(
      'Unsaved definition',
    );
  });

  it('round-trips an unsaved new Concept name through draft restoration', async () => {
    const router = renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('A single piece of knowledge'), {
      target: { value: 'Complete the square' },
    });

    await act(() => router.navigate('/away'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Other page')).toBeInTheDocument();
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.newConceptName).toBe(
      'Complete the square',
    );

    await act(() => router.navigate('/course/course-1/questions/new'));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore draft' }));
    expect(screen.getByPlaceholderText('A single piece of knowledge')).toHaveValue(
      'Complete the square',
    );
  });

  it('clears the pending Concept name after successful Concept creation', async () => {
    mocks.createConcept.mockResolvedValueOnce({ id: 'concept-2' });
    renderEditor();
    const input = await screen.findByPlaceholderText('A single piece of knowledge');

    fireEvent.change(input, { target: { value: 'Complete the square' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(input).toHaveValue(''));
    expect(mocks.createConcept).toHaveBeenCalledWith('course-1', 'Complete the square');
  });

  it('offers Restore and Discard, and restored drafts remain guarded', async () => {
    mocks.data!.concepts.push({
      ...mocks.data!.concepts[0],
      id: 'concept-2',
      name: 'Quadratic equations',
    });
    const key = questionDraftKey('course-1');
    saveDraft<QuestionDraftData>(key, {
      state: {
        ...EMPTY_QUESTION_AUTHORING_STATE,
        name: 'Recovered definition',
        targetConceptId: 'concept-2',
      },
      timestamp: 10,
    });
    const router = renderEditor();

    expect(await screen.findByRole('button', { name: 'Discard draft' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore draft' }));
    expect(screen.getByPlaceholderText('Completing the square')).toHaveValue(
      'Recovered definition',
    );
    expect(screen.getByRole('combobox', { name: 'Primary skill practised' })).toHaveValue(
      'concept-2',
    );
    await act(() => router.navigate('/away'));
    expect(await screen.findByRole('dialog', { name: 'Leave this Question?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  });

  it('discards a stored draft without making the untouched editor dirty', async () => {
    const key = questionDraftKey('course-1');
    saveDraft<QuestionDraftData>(key, {
      state: { ...EMPTY_QUESTION_AUTHORING_STATE, name: 'Throw this away' },
      timestamp: 10,
    });
    const router = renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    expect(loadDraft(key)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Primary skill practised' })).toHaveValue('');
    await act(() => router.navigate('/away'));
    expect(await screen.findByText('Other page')).toBeInTheDocument();
  });

  it('does not mark the editor dirty when the selected kind is clicked again', async () => {
    const router = renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Fixed problem' }));
    await act(() => router.navigate('/away'));

    expect(await screen.findByText('Other page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Leave this Question?' })).not.toBeInTheDocument();
  });

  it('crossfades the primary save label while preserving its current accessible name', async () => {
    let finishSave!: () => void;
    mocks.createFixed.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('Completing the square'), {
      target: { value: 'Pending definition' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Prompt' } });
    fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Worked explanation'), {
      target: { value: 'Explanation' },
    });

    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByText('Saving…')).toHaveStyle({ opacity: '0' });

    finishSave();
    expect(await screen.findByText('Questions list')).toBeInTheDocument();
  });

  it('retains authoring state when saving fails', async () => {
    mocks.createFixed.mockRejectedValueOnce(new Error('Database write failed'));
    const router = renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('Completing the square'), {
      target: { value: 'Failed definition' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Prompt' } });
    fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Worked explanation'), {
      target: { value: 'Explanation' },
    });
    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith('Database write failed', 'negative'),
    );

    await act(() => router.navigate('/away'));
    expect(await screen.findByRole('dialog', { name: 'Leave this Question?' })).toBeInTheDocument();
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.name).toBe(
      'Failed definition',
    );
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.targetConceptId).toBe(
      'concept-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(await screen.findByText('Questions list')).toBeInTheDocument();
    expect(mocks.createFixed).toHaveBeenCalledTimes(2);
    expect(mocks.createFixed).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Failed definition', targetConceptId: 'concept-1' }),
    );
  });
});
