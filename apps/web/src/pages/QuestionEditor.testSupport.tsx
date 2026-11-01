import { fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import type { CourseQuestionData } from '../components/questions/useQuestionData';
import type { QuestionConceptSet, QuestionDefinition } from '../questions/types';
import { QuestionEditor } from './QuestionEditor';

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
    id: 'course-1',
    name: 'Mathematics',
    lessonViewMode: 'study',
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

export function renderEditor(entry = '/course/course-1/questions/new') {
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

export function chooseConcept() {
  fireEvent.change(screen.getByRole('combobox', { name: /^Primary skill practised/ }), {
    target: { value: 'concept-1' },
  });
}

export { mocks };
