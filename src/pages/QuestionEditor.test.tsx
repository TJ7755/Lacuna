import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import { loadDraft, saveDraft } from '../utils/drafts';
import { QuestionEditor } from './QuestionEditor';
import {
  EMPTY_QUESTION_AUTHORING_STATE,
  questionDraftKey,
  type QuestionDraftData,
} from './questionDraft';

const mocks = vi.hoisted(() => ({
  createFixed: vi.fn(),
  createGenerated: vi.fn(),
  createConcept: vi.fn(),
  updateFixed: vi.fn(),
  updateGenerated: vi.fn(),
  deleteQuestion: vi.fn(),
  notify: vi.fn(),
  data: undefined as CourseQuestionData | undefined,
}));

vi.mock('../components/questions/useQuestionData', () => ({
  useCourseQuestionData: () => mocks.data,
  useQuestionRecord: () => null,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => ({ id: 'course-1', name: 'Mathematics' }),
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
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock('../components/items/NumericAnswerEditor', () => ({
  numericAnswerSpecIsValid: (value: { value?: string }) => Boolean(value.value?.trim()),
  NumericAnswerEditor: ({
    value,
    onChange,
  }: {
    value: { kind: 'exact'; value: string };
    onChange: (value: { kind: 'exact'; value: string }) => void;
  }) => (
    <input
      aria-label="Expected answer"
      value={value.value}
      onChange={(event) => onChange({ kind: 'exact', value: event.target.value })}
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
    mocks.createFixed.mockResolvedValue(undefined);
  });

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

  it('creates the audited built-in quadratic Question family', async () => {
    mocks.createGenerated.mockResolvedValue(undefined);
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));
    fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
      target: { value: 'Integer-root quadratics' },
    });
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
    const key = questionDraftKey('course-1');
    saveDraft<QuestionDraftData>(key, {
      state: { ...EMPTY_QUESTION_AUTHORING_STATE, name: 'Recovered definition' },
      timestamp: 10,
    });
    const router = renderEditor();

    expect(await screen.findByRole('button', { name: 'Discard draft' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore draft' }));
    expect(screen.getByPlaceholderText('Completing the square')).toHaveValue(
      'Recovered definition',
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

    const family = screen.getByText('Built-in family').parentElement;
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
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith('Database write failed', 'negative'),
    );

    await act(() => router.navigate('/away'));
    expect(await screen.findByRole('dialog', { name: 'Leave this Question?' })).toBeInTheDocument();
    expect(loadDraft<QuestionDraftData>(questionDraftKey('course-1'))?.state.name).toBe(
      'Failed definition',
    );
  });
});

function renderEditor() {
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/questions/new', element: <QuestionEditor /> },
      { path: '/course/:courseId/questions', element: <p>Questions list</p> },
      { path: '/away', element: <p>Other page</p> },
    ],
    { initialEntries: ['/course/course-1/questions/new'] },
  );
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return router;
}
