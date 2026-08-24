import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import { QuestionEditor } from './QuestionEditor';

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
  MarkSchemeEditor: () => null,
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
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/new']}>
        <Routes>
          <Route path="/course/:courseId/questions/new" element={<QuestionEditor />} />
          <Route path="/course/:courseId/questions" element={<p>Questions list</p>} />
        </Routes>
      </MemoryRouter>,
    );

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
  });

  it('creates the audited built-in quadratic Question family', async () => {
    mocks.createGenerated.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions/new']}>
        <Routes>
          <Route path="/course/:courseId/questions/new" element={<QuestionEditor />} />
          <Route path="/course/:courseId/questions" element={<p>Questions list</p>} />
        </Routes>
      </MemoryRouter>,
    );

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
});
