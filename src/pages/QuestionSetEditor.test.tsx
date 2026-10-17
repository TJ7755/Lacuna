import 'fake-indexeddb/auto';
import { createFixedQuestion } from '../questions/repository.authoring';
import { createConcept } from '../questions/repository.concepts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createLesson } from '../db/lessonRepository';
import { createCourseAssessment } from '../db/assessmentRepository';
import {
  createEmptyQuestionSetDraft,
  loadQuestionSetDraft,
  saveQuestionSetDraft,
} from '../questions/questionSetDrafts';
import { QuestionSetEditor } from './QuestionSetEditor';
import { QuestionsPage } from './QuestionsPage';

// The question bank fades in, which jsdom never completes; render it at rest.
vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  speedMultiplier: () => 0,
}));

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
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Cells' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
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
  it('opens legacy drafts on contents with focused name details', async () => {
    const course = await setup();
    open(course.id);
    expect(await screen.findByRole('heading', { name: 'Untitled set', level: 1 })).toBeVisible();
    expect(screen.queryByLabelText('Question text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save set' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cells' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('heading', { name: 'Cells', level: 1 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Q1' })).toBeVisible();
  });
  it('is keyboard-first: title focused, Ctrl+Enter continues, Escape steps back', async () => {
    const course = await setup();
    open(course.id);
    const title = await screen.findByLabelText('Name');
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.change(title, { target: { value: 'Cells' } });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('heading', { name: 'Cells', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Q1' }));
    fireEvent.keyDown(await screen.findByLabelText('Question text'), { key: 'Escape' });
    expect(await screen.findByRole('heading', { name: 'Cells', level: 1 })).toBeVisible();
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
    fireEvent.click(screen.getByRole('link', { name: 'Question sets' }));
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
  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'keeps split confirmation shortcuts inside the decision: %j',
    async (modifier) => {
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
      const trigger = screen.getByRole('button', { name: 'Use separate parts' });
      trigger.focus();
      fireEvent.click(trigger);
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      expect(cancel).toHaveFocus();
      fireEvent.keyDown(cancel, { key: 'Enter', ...modifier });
      expect(screen.getByRole('heading', { name: 'Write Q1' })).toBeVisible();
      expect(cancel).toBeInTheDocument();
      fireEvent.keyDown(cancel, { key: 'Escape' });
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Write Q1' })).toBeVisible();
      expect(trigger).toHaveFocus();
      fireEvent.keyDown(trigger, { key: 'Enter', ...modifier });
      expect(screen.getByLabelText('Marking criterion')).toHaveValue('Keep this scheme');
    },
  );

  it('ignores composition whilst progressing question-set steps', async () => {
    const course = await setup();
    open(course.id);
    const title = await screen.findByLabelText('Name');
    fireEvent.change(title, { target: { value: 'Cells' } });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(title).toBeInTheDocument();
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true, keyCode: 229 });
    expect(title).toBeInTheDocument();
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('heading', { name: 'Cells', level: 1 })).toBeVisible();
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
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
  it('shows local drafts only in Edit mode and creates a real empty set', async () => {
    const course = await setup();
    await db.courses.update(course.id, { lessonViewMode: 'study' });
    const view = open(course.id, 'questions');
    expect(await screen.findByText('No question sets yet')).toBeInTheDocument();
    // Says what a question set is to someone who has never made one.
    expect(screen.getByText('Exam-style questions with mark schemes.')).toBeInTheDocument();
    expect(screen.queryByText('Untitled set')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New question set' }));
    expect(await screen.findByLabelText('Name')).toHaveFocus();
    expect((await db.courses.get(course.id))?.lessonViewMode).toBe('edit');
    expect(screen.queryByText('Switch to Edit to write one')).not.toBeInTheDocument();
    view.unmount();
    await db.courses.update(course.id, { lessonViewMode: 'edit' });
    open(course.id, 'questions');
    expect(await screen.findByText('Untitled set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New question set' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('');
    expect(screen.queryByLabelText('Question text')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New set' } });
    fireEvent.submit(screen.getByRole('form', { name: 'New question set' }));
    expect(await screen.findByRole('heading', { name: 'New set', level: 1 })).toBeVisible();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
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
  it('shows saving only during edits and keeps saved confirmation out of sight', async () => {
    const course = await setup();
    open(course.id);
    const name = await screen.findByLabelText('Name');
    expect(screen.queryByText('Draft saved on this device')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: 'Cells' } });
    expect(screen.getByText('Saving…')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
    expect(screen.getByText('Saved')).toHaveClass('sr-only');
  });
  it('summarises linked lessons and reveals editable settings in place', async () => {
    const course = await setup();
    const lesson = await createLesson(course.id, 'Cell structure');
    const exam = await createCourseAssessment(course.id, 'Mock exam', Date.now() + 86_400_000);
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    draft.content.title = 'Cells';
    draft.content.lessonIds = [lesson.id];
    draft.content.assessmentIds = [exam.id];
    await saveQuestionSetDraft(draft, { expectedDraftRevisionId: draft.draftRevisionId });
    open(course.id);
    expect(await screen.findByText('Covers Cell structure · Mock exam')).toBeVisible();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Cells');
    expect(await screen.findByRole('checkbox', { name: 'Cell structure' })).toBeChecked();
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });
});
