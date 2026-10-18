import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import type { QuestionConceptSet, QuestionDefinition } from '../questions/types';
import { loadDraft, saveDraft } from '../utils/drafts';
import { QuestionEditor } from './QuestionEditor';
import {
  EMPTY_QUESTION_AUTHORING_STATE,
  questionDraftKey,
  type QuestionDraftData,
} from './questionDraft';

const mocks = vi.hoisted(() => ({
  locked: false,
  createFixed: vi.fn(),
  createGenerated: vi.fn(),
  createConcept: vi.fn(),
  updateFixed: vi.fn(),
  updateGenerated: vi.fn(),
  deleteQuestion: vi.fn(),
  notify: vi.fn(),
  data: undefined as CourseQuestionData | undefined,
  record: null as { question: QuestionDefinition; conceptSet: QuestionConceptSet } | null,
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.data,
  useQuestionRecord: () => mocks.record,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => ({
    id: 'course-1', name: 'Mathematics', lessonViewMode: 'study',
    distributedCopy: mocks.locked
      ? { lineageId: 'published-course', revision: 1, locked: true, autoAcceptUpdates: false }
      : undefined,
  }),
  useLessons: () => [],
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock('../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    label,
    value,
    onChange,
    inputRef,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    inputRef?: React.Ref<HTMLTextAreaElement>;
  }) => (
    <textarea
      ref={inputRef}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('../components/items/MarkSchemeEditor', () => ({
  MarkSchemeEditor: () => <div>Working answer editor</div>,
}));

vi.mock('../components/ui/TagInput', () => ({
  TagInput: () => null,
}));

vi.mock('../questions/repository', () => ({
  createConcept: mocks.createConcept,
  createFixedQuestion: mocks.createFixed,
  createGeneratedQuestion: mocks.createGenerated,
  updateFixedQuestion: mocks.updateFixed,
  updateGeneratedQuestion: mocks.updateGenerated,
  deleteQuestion: mocks.deleteQuestion,
}));

describe('QuestionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locked = false;
    localStorage.clear();
    mocks.data = {
      questions: [],
      conceptSets: [],
      concepts: [
        {
          id: 'concept-1',
          scope: 'course',
          scopeKey: 'course:course-1',
          courseId: 'course-1',
          name: 'Addition',
          provisional: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      attempts: [],
    };
    mocks.record = null;
    mocks.createFixed.mockResolvedValue(undefined);
  });

  it('offers a working route back when the requested Question no longer exists', async () => {
    const router = renderEditor('/course/course-1/questions/missing');
    expect(
      await screen.findByRole('heading', { name: 'This Question could not be found.' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Questions' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/course/course-1/questions'));
  });

  it('uses the task title without repeating it in a decorative eyebrow', async () => {
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Create a Question' })).toBeInTheDocument();
    expect(screen.queryByText('New definition')).not.toBeInTheDocument();
  });

  it.each(['fixed', 'generated'] as const)(
    'requires a deliberate Concept choice for a new %s Question',
    async (kind) => {
      renderEditor();
      const concept = await screen.findByRole('combobox', { name: 'Primary skill practised' });
      expect(concept).toHaveValue('');
      fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
        target: { value: 'Deliberate choice' },
      });
      if (kind === 'generated') {
        fireEvent.click(screen.getByRole('button', { name: 'Generated family' }));
      } else {
        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
        fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
        fireEvent.change(screen.getByLabelText('Worked explanation'), {
          target: { value: 'Combine the pairs.' },
        });
      }
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

      expect(concept).toHaveFocus();
      expect(concept).toHaveAccessibleDescription('Choose the primary skill practised.');
      expect(concept).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByPlaceholderText('Completing the square')).toHaveValue('Deliberate choice');
      expect(mocks.createFixed).not.toHaveBeenCalled();
      expect(mocks.createGenerated).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();

      chooseConcept();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      await waitFor(() =>
        expect(kind === 'fixed' ? mocks.createFixed : mocks.createGenerated).toHaveBeenCalledWith(
          expect.objectContaining({ courseId: 'course-1', targetConceptId: 'concept-1' }),
        ),
      );
    },
  );

  it('creates a fixed Question with a worked explanation and one target Concept', async () => {
    renderEditor();

    fireEvent.change(await screen.findByPlaceholderText('Completing the square'), {
      target: { value: 'Apply addition' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
    fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Worked explanation'), {
      target: { value: 'Combine the two pairs to get four.' },
    });
    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    await waitFor(() =>
      expect(mocks.createFixed).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course-1',
          name: 'Apply addition',
          targetConceptId: 'concept-1',
          prompt: 'What is 2 + 2?',
          explanation: 'Combine the two pairs to get four.',
          payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        }),
      ),
    );
    expect(await screen.findByText('Questions list')).toBeInTheDocument();
    expect(loadDraft(questionDraftKey('course-1'))).toBeNull();
  });

  it('starts at the prompt and reports missing fields where they are, focusing the first', async () => {
    renderEditor();
    const prompt = await screen.findByLabelText('Prompt');
    await waitFor(() => expect(prompt).toHaveFocus());
    fireEvent.change(prompt, { target: { value: 'What is 2 + 2?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    expect(screen.getByLabelText('Expected answer')).toHaveFocus();
    expect(screen.getByText('Add a valid answer.')).toBeInTheDocument();
    expect(screen.getByText('Add a name.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Completing the square')).toHaveAccessibleDescription(
      'Add a name.',
    );
    expect(prompt).toHaveValue('What is 2 + 2?');
    expect(mocks.createFixed).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each(['alternative', 'tolerance'] as const)(
    'focuses the invalid %s through the numeric editor and preserves it for correction',
    async (kind) => {
      renderEditor();
      const prompt = await screen.findByRole('textbox', { name: 'Prompt' });
      fireEvent.change(prompt, { target: { value: 'Give an accepted value.' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Worked explanation' }), {
        target: { value: 'Use the accepted values.' },
      });
      const name = screen.getByPlaceholderText('Completing the square');
      fireEvent.change(name, { target: { value: 'Precise numeric focus' } });
      chooseConcept();
      fireEvent.click(
        screen.getByRole('button', {
          name: kind === 'alternative' ? 'One of' : 'Tolerance',
        }),
      );
      if (kind === 'alternative') {
        fireEvent.click(screen.getByRole('button', { name: 'Add accepted answer' }));
      }
      const invalid =
        kind === 'alternative'
          ? screen.getByRole('textbox', { name: 'Accepted answer 2' })
          : screen.getByRole('spinbutton', { name: 'Plus or minus' });
      if (kind === 'tolerance') fireEvent.change(invalid, { target: { value: '-1' } });

      name.focus();
      fireEvent.keyDown(name, { key: 'Enter', ctrlKey: true, isComposing: true, keyCode: 229 });
      expect(name).toHaveFocus();
      expect(screen.queryByText('Add a valid answer.')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      await waitFor(() => expect(invalid).toHaveFocus());
      expect(prompt).toHaveValue('Give an accepted value.');
      expect(mocks.createFixed).not.toHaveBeenCalled();
      name.focus();
      fireEvent.keyDown(name, { key: 'Enter', metaKey: true });
      await waitFor(() => expect(invalid).toHaveFocus());

      fireEvent.change(invalid, { target: { value: kind === 'alternative' ? '5' : '0.1' } });
      fireEvent.keyDown(invalid, { key: 'Enter', ctrlKey: true });
      await waitFor(() =>
        expect(mocks.createFixed).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Precise numeric focus',
            targetConceptId: 'concept-1',
            payload: {
              v: 1,
              kind: 'numeric',
              answer:
                kind === 'alternative'
                  ? { kind: 'matches-one-of', values: ['4', '5'] }
                  : { kind: 'within', value: '4', tolerance: 0.1 },
            },
          }),
        ),
      );
      await waitFor(() => expect(prompt).toHaveValue(''));
      await waitFor(() => expect(prompt).toHaveFocus());
    },
  );

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

  it.each([
    [
      'Minimum root magnitude',
      '0',
      '1',
      'Enter a whole number from 1 to 20.',
      'minimumRootMagnitude',
    ],
    [
      'Minimum root magnitude',
      '10',
      '3',
      'Use a minimum root magnitude no greater than the maximum.',
      'minimumRootMagnitude',
    ],
    [
      'Maximum root magnitude',
      '21',
      '5',
      'Enter a whole number from 1 to 20.',
      'maximumRootMagnitude',
    ],
    [
      'Maximum leading coefficient',
      '1.5',
      '2',
      'Enter a whole number from 1 to 9.',
      'maximumLeadingCoefficient',
    ],
  ])(
    'keeps invalid generator input inline and focuses %s (%s)',
    async (label, invalid, valid, message, key) => {
      renderEditor();
      fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));
      fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
        target: { value: 'Retained family' },
      });
      chooseConcept();
      const field = screen.getByRole('spinbutton', { name: label });
      fireEvent.change(field, { target: { value: invalid } });
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });

      expect(field).toHaveFocus();
      expect(field).toHaveValue(Number(invalid));
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(message);
      expect(screen.getByPlaceholderText('Completing the square')).toHaveValue('Retained family');
      expect(mocks.createGenerated).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();

      fireEvent.change(field, { target: { value: valid } });
      expect(field).toHaveFocus();
      expect(field).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      expect(await screen.findByText('Questions list')).toBeInTheDocument();
      expect(mocks.createGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Retained family',
          targetConceptId: 'concept-1',
          generatorConfig: expect.objectContaining({
            [key]: Number(valid),
          }),
        }),
      );
    },
  );

  it('creates the audited built-in quadratic Question family', async () => {
    mocks.createGenerated.mockResolvedValue(undefined);
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));
    fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
      target: { value: 'Integer-root quadratics' },
    });
    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    await waitFor(() =>
      expect(mocks.createGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course-1',
          name: 'Integer-root quadratics',
          targetConceptId: 'concept-1',
          generatorKey: 'integer-root-quadratic',
          generatorVersion: 1,
          generatorConfig: {
            minimumRootMagnitude: 1,
            maximumRootMagnitude: 5,
            maximumLeadingCoefficient: 2,
            allowRepeatedRoots: false,
          },
        }),
      ),
    );
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
    expect(screen.getByRole('combobox', { name: 'Primary skill practised' })).toHaveValue('concept-2');
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

  it('brings the replacement answer editor in through the continuity transition', async () => {
    renderEditor();

    expect(await screen.findByLabelText('Expected answer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show working' }));

    expect(screen.getByText('Working answer editor').parentElement).toHaveStyle({ opacity: '0' });
  });

  it('brings the generated-family mode in through the same surface transition', async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));

    const family = screen.getByRole('heading', { name: 'Integer-root quadratic equations' }).parentElement;
    expect(family?.parentElement).toHaveStyle({ opacity: '0' });
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

  it.each(['fixed', 'generated'] as const)('blocks creating %s Questions in a locked copy', async (kind) => {
    mocks.locked = true;
    renderEditor();
    await screen.findByRole('heading', { name: 'Create a Question' });
    if (kind === 'generated') fireEvent.click(screen.getByRole('button', { name: 'Generated family' }));
    fireEvent.change(screen.getByPlaceholderText('Completing the square'), { target: { value: 'Changed definition' } });
    if (kind === 'fixed') {
      fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
      fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
      fireEvent.change(screen.getByLabelText('Worked explanation'), { target: { value: 'Combine the pairs.' } });
    }
    const save = screen.getByRole('button', { name: 'Create Question' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mocks.createFixed).not.toHaveBeenCalled();
    expect(mocks.createGenerated).not.toHaveBeenCalled();
  });

  it('blocks adding Concepts from a locked Question editor', async () => {
    mocks.locked = true;
    renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('A single piece of knowledge'), { target: { value: 'Published skill' } });
    const add = screen.getByRole('button', { name: /^Add$/ });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(mocks.createConcept).not.toHaveBeenCalled();
  });

  it('blocks editing or deleting a locked Question definition', async () => {
    mocks.locked = true;
    mocks.record = {
      question: {
        id: 'question-1', courseId: 'course-1', kind: 'fixed', name: 'Apply addition',
        prompt: 'What is 2 + 2?', payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        explanation: 'Combine the pairs.', primaryLessonId: null, tags: [], suspended: false,
      } as unknown as QuestionDefinition,
      conceptSet: {
        questionId: 'question-1', courseId: 'course-1', targetConceptIds: ['concept-1'], prerequisiteConceptIds: [],
      } as unknown as QuestionConceptSet,
    };
    renderEditor('/course/course-1/questions/question-1');
    const save = await screen.findByRole('button', { name: 'Save Question' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mocks.updateFixed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  describe('deleting a stored Question', () => {
    const openEditor = () => {
      mocks.record = {
        question: {
          id: 'question-1',
          courseId: 'course-1',
          kind: 'fixed',
          name: 'Apply addition',
          prompt: 'What is 2 + 2?',
          payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
          explanation: 'Combine the pairs.',
          primaryLessonId: null,
          tags: [],
          suspended: false,
        } as unknown as QuestionDefinition,
        conceptSet: {
          questionId: 'question-1',
          courseId: 'course-1',
          targetConceptIds: ['concept-1'],
          prerequisiteConceptIds: [],
        } as unknown as QuestionConceptSet,
      };
      renderEditor('/course/course-1/questions/question-1');
    };
    const copy = 'Delete this Question definition? Its attempt evidence will be retained.';

    it('saves suspension from the standard switch with the Question draft', async () => {
      openEditor();
      const control = await screen.findByRole('switch', { name: 'Suspend this Question' });
      expect(control).not.toBeChecked();
      fireEvent.click(control);
      fireEvent.click(screen.getByRole('button', { name: 'Save Question' }));
      await waitFor(() => expect(mocks.updateFixed).toHaveBeenCalledWith(
        'question-1', expect.objectContaining({ suspended: true }),
      ));
    });

    it('asks inline and leaves the definition intact on Cancel', async () => {
      openEditor();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      expect(await screen.findByText(copy)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(mocks.deleteQuestion).not.toHaveBeenCalled();
    });

    it('deletes the definition once confirmed', async () => {
      openEditor();
      mocks.deleteQuestion.mockResolvedValue(undefined);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await screen.findByText(copy);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(mocks.deleteQuestion).toHaveBeenCalledWith('question-1'));
      expect(await screen.findByText('Questions list')).toBeInTheDocument();
    });
  });
});

function renderEditor(entry = '/course/course-1/questions/new') {
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/questions/new', element: <QuestionEditor /> },
      { path: '/course/:courseId/questions/:questionId', element: <QuestionEditor /> },
      { path: '/course/:courseId/questions', element: <p>Questions list</p> },
      { path: '/away', element: <p>Other page</p> },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function chooseConcept() {
  fireEvent.change(screen.getByRole('combobox', { name: /^Primary skill practised/ }), {
    target: { value: 'concept-1' },
  });
}
