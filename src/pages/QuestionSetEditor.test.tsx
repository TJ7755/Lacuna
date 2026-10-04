import 'fake-indexeddb/auto';
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
  it('autosaves incomplete work, validates marking and publishes the real document', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Set title'), { target: { value: 'Cells' } });
    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Name the organelle.' },
    });
    await waitFor(async () =>
      expect((await loadQuestionSetDraft(course.id, 'paper-set'))?.content.title).toBe('Cells'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));
    expect(await screen.findByText(/Add an answer format/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Define marks →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    fireEvent.change(screen.getByLabelText('Marking criterion'), { target: { value: 'Nucleus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));
    expect(await screen.findByText('Published overview')).toBeInTheDocument();
    expect(
      (await db.questionSets.get('paper-set'))?.questions[0].answer?.allocations[0].criterion,
    ).toBe('Nucleus');
    expect(await loadQuestionSetDraft(course.id, 'paper-set')).toBeNull();
  });
  it('protects scored content before changing it into shared source', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Question text');
    fireEvent.click(screen.getByRole('button', { name: 'Define marks →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    fireEvent.change(screen.getByLabelText('Marking criterion'), {
      target: { value: 'Keep this scheme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
    expect(
      screen.getByText(/Its answer format and mark scheme will be removed/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Marking criterion')).toHaveValue('Keep this scheme');
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
    expect(screen.getByLabelText('Question text')).toHaveValue('');
  });
  it('stores multiple-choice options and confirms a format change that would discard them', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Question text');
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'multiple-choice' } });
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
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'written' } });
    expect(screen.getByText('Remove the existing answer options?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Option 1', { exact: true })).toHaveValue('Ionic bonding');
  });
});
