import 'fake-indexeddb/auto';
import { createFixedQuestion } from '../questions/repository.authoring';
import { createConcept } from '../questions/repository.concepts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import {
  createEmptyQuestionSetDraft,
  loadQuestionSetDraft,
  saveQuestionSetDraft,
} from '../questions/questionSetDrafts';
import { QuestionSetEditor } from './QuestionSetEditor';
import { QuestionsPage } from './QuestionsPage';

vi.mock('../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

async function setup() {
  const course = await createCourse('Biology');
  await db.courses.update(course.id, { lessonViewMode: 'edit' });
  const draft = createEmptyQuestionSetDraft(course.id, 'paper-set');
  draft.content.questions = [{ id: 'q1', prompt: '', parts: [] }];
  await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  return course;
}
function open(courseId: string, path = 'question-sets/paper-set/edit') {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/course/:courseId/question-sets/:setId/edit', element: <QuestionSetEditor /> },
          { path: '/course/:courseId/question-sets/:setId', element: <p>Published overview</p> },
          { path: '/course/:courseId/questions', element: <QuestionsPage /> },
        ],
        { initialEntries: [`/course/${courseId}/${path}`] },
      )}
    />,
  );
}
async function beginQuestion() {
  fireEvent.change(await screen.findByLabelText('Set title'), { target: { value: 'Cells' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Q1' }));
}
describe('Paper question set authoring', () => {
  beforeEach(async () => {
    await Promise.all([
      db.courses.clear(),
      db.questionSets.clear(),
      db.appState.clear(),
      db.questions.clear(),
      db.lessons.clear(),
      db.concepts.clear(),
      db.cards.clear(),
      db.courseAssessments.clear(),
    ]);
  });
  it('starts with set details and gives a clear route to the question list', async () => {
    const course = await setup();
    open(course.id);
    expect(await screen.findByRole('heading', { name: 'Create a question set' })).toBeVisible();
    expect(screen.queryByLabelText('Question text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save set' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Set title'), { target: { value: 'Cells' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
    expect(screen.getByRole('heading', { name: 'Questions in this set' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Q1' })).toBeVisible();
  });
  it('does not repeat the course name above Questions', async () => {
    const course = await setup();
    open(course.id, 'questions');
    await screen.findByRole('heading', { name: 'Questions' });
    expect(screen.queryByText('Biology')).not.toBeInTheDocument();
  });
  it('opens individual questions in their own view and returns to the set library', async () => {
    const course = await setup();
    const concept = await createConcept(course.id, 'Cell size');
    await createFixedQuestion({
      courseId: course.id,
      name: 'Cell calculation',
      prompt: 'Calculate the size.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '3' } },
      explanation: 'Divide by magnification.',
      targetConceptId: concept.id,
      prerequisiteConceptIds: [],
    });
    open(course.id, 'questions');
    fireEvent.click(await screen.findByRole('link', { name: /Individual questions/ }));
    expect(await screen.findByRole('heading', { name: 'Individual questions' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Questions' })).not.toBeInTheDocument();
    expect(screen.getByText('Cell calculation')).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: '← Question sets' }));
    expect(await screen.findByRole('heading', { name: 'Questions' })).toBeVisible();
    expect(screen.queryByText('Cell calculation')).not.toBeInTheDocument();
  });
  it('autosaves incomplete work, validates marking and publishes the real document', async () => {
    const course = await setup();
    open(course.id);
    await beginQuestion();
    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Name the organelle.' },
    });
    await waitFor(async () =>
      expect((await loadQuestionSetDraft(course.id, 'paper-set'))?.content.title).toBe('Cells'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue to mark scheme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to linked knowledge' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what earns each mark');
    fireEvent.change(screen.getByLabelText('Marking criterion'), { target: { value: 'Nucleus' } });
    fireEvent.change(screen.getByLabelText('Marks for this point'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to linked knowledge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done — back to questions' }));
    expect(screen.getByText('Ready')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));
    expect(await screen.findByText('Published overview')).toBeInTheDocument();
    expect(
      (await db.questionSets.get('paper-set'))?.questions[0].answer?.allocations[0].criterion,
    ).toBe('Nucleus');
    expect((await db.questionSets.get('paper-set'))?.questions[0].answer?.maxMarks).toBe(2);
    expect(await loadQuestionSetDraft(course.id, 'paper-set')).toBeNull();
  });
  it('protects scored content before changing it into shared source', async () => {
    const course = await setup();
    open(course.id);
    await beginQuestion();
    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Name the organelle.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to mark scheme' }));
    fireEvent.change(screen.getByLabelText('Marking criterion'), {
      target: { value: 'Keep this scheme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use separate parts' }));
    expect(
      screen.getByText(/Its answer format and mark scheme will be removed/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to mark scheme' }));
    expect(screen.getByLabelText('Marking criterion')).toHaveValue('Keep this scheme');
  });
  it('guides a multipart question from its introduction to its first part and subpart', async () => {
    const course = await setup();
    open(course.id);
    await beginQuestion();
    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Study the cell diagram.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use separate parts' }));
    expect(screen.getByRole('heading', { name: 'Write Q1' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Written answer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to first part' }));
    expect(screen.getByRole('heading', { name: 'Write Q1 (a)' })).toBeVisible();
    expect(screen.getByText('Study the cell diagram.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Consider the nucleus.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use subparts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to first part' }));
    expect(screen.getByRole('heading', { name: 'Write Q1 (a) (i)' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to questions' }));
    expect(screen.getByRole('button', { name: 'Edit Q1 (a) (i)' })).toBeVisible();
    await waitFor(async () =>
      expect(
        (await loadQuestionSetDraft(course.id, 'paper-set'))?.content.questions[0].parts[0]
          .subparts,
      ).toHaveLength(1),
    );
  });
  it('does not open authoring controls for a locked course', async () => {
    const course = await setup();
    const stored = await db.courses.get(course.id);
    await db.courses.put({ ...stored!, distributedCopy: { locked: true } } as never);
    open(course.id);
    expect(await screen.findByText(/This course is read-only/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Set title')).not.toBeInTheDocument();
  });
  it('shows local drafts only in Author mode and creates a real empty set', async () => {
    const course = await setup();
    await db.courses.update(course.id, { lessonViewMode: 'study' });
    const view = open(course.id, 'questions');
    expect(await screen.findByText('No question sets yet')).toBeInTheDocument();
    expect(screen.queryByText('Untitled set')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New question set' })).not.toBeInTheDocument();
    view.unmount();
    await db.courses.update(course.id, { lessonViewMode: 'edit' });
    open(course.id, 'questions');
    expect(await screen.findByText('Untitled set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New question set' }));
    expect(await screen.findByLabelText('Set title')).toHaveValue('');
    expect(screen.queryByLabelText('Question text')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Set title'), { target: { value: 'New set' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to questions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add first question' }));
    expect(screen.getByLabelText('Question text')).toHaveValue('');
  });
  it('stores multiple-choice options and confirms a format change that would discard them', async () => {
    const course = await setup();
    open(course.id);
    await beginQuestion();
    fireEvent.click(screen.getByRole('radio', { name: 'Multiple choice' }));
    fireEvent.change(screen.getByLabelText('Option 1', { exact: true }), {
      target: { value: 'Ionic bonding' },
    });
    fireEvent.change(screen.getByLabelText('Option 2', { exact: true }), {
      target: { value: 'Covalent bonding' },
    });
    fireEvent.click(screen.getByLabelText('Option 1 is correct'));
    await waitFor(async () => {
      const draft = await loadQuestionSetDraft(course.id, 'paper-set');
      const response = draft?.content.questions[0].answer?.response;
      expect(response?.kind).toBe('multiple-choice');
      if (response?.kind === 'multiple-choice')
        expect(response.correctOptionIds).toEqual([response.options[0].id]);
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Written answer' }));
    expect(screen.getByText('Remove the existing answer options?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Option 1', { exact: true })).toHaveValue('Ionic bonding');
  });
});
