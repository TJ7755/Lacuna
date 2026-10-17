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
import { ToastProvider } from '../components/ui/Toast';
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
    <ToastProvider>
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: '/course/:courseId/question-sets/:setId/edit', element: <QuestionSetEditor /> },
            { path: '/course/:courseId/question-sets/:setId', element: <p>Published overview</p> },
            { path: '/course/:courseId/questions', element: <QuestionsPage /> },
          ],
          { initialEntries: [`/course/${courseId}/${path}`] },
        )}
      />
    </ToastProvider>,
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
  it('uses concise captions for all three composer columns', async () => {
    const course = await setup();
    const { container } = open(course.id);
    await screen.findByLabelText('Q1 question');
    expect(
      Array.from(
        container.querySelectorAll('.qs-composer-captions span'),
        (span) => span.textContent,
      ),
    ).toEqual(['', 'Question', 'Mark scheme', 'Marks', '']);
  });

  it('opens on the first question without focusing the title and supports the writing loop', async () => {
    const course = await setup();
    open(course.id);
    const question = await screen.findByLabelText('Q1 question');
    expect(question).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    fireEvent.change(question, { target: { value: 'Name the organelle.' } });
    fireEvent.keyDown(question, { key: 'Tab' });
    expect(screen.getByLabelText('Q1 mark scheme')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), { target: { value: 'Nucleus' } });
    fireEvent.keyDown(screen.getByLabelText('Q1 mark scheme'), { key: 'Tab' });
    expect(screen.getByLabelText('Q1 marks')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    expect(screen.getByLabelText('Q2 question')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Q1 row options' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('indents an empty row, moves its parent scheme and offers a working Undo', async () => {
    const course = await setup();
    open(course.id);
    const first = await screen.findByLabelText('Q1 question');
    fireEvent.change(first, { target: { value: 'Shared source' } });
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), {
      target: { value: 'Original point (2)' },
    });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'Tab' });
    expect(screen.getByLabelText('Q1 (a) question')).toHaveFocus();
    expect(screen.getByLabelText('Q1 (a) mark scheme')).toHaveValue('Original point (2)');
    expect(screen.queryByLabelText('Q1 mark scheme')).not.toBeInTheDocument();
    expect(screen.getByText('Mark scheme moved into (a)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Q1 mark scheme')).toHaveValue('Original point (2)');
    expect(screen.getByLabelText('Q2 question')).toHaveValue('');
  });
  it('outdents empty parts and deletes blank rows with Backspace', async () => {
    const course = await setup();
    open(course.id);
    const first = await screen.findByLabelText('Q1 question');
    fireEvent.change(first, { target: { value: 'Shared source' } });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'Tab' });
    const part = screen.getByLabelText('Q1 (a) question');
    fireEvent.keyDown(part, { key: 'Tab', shiftKey: true });
    expect(screen.getByLabelText('Q2 question')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'Backspace' });
    expect(screen.queryByLabelText('Q2 question')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Q1 marks')).toHaveFocus();
  });
  it('leaves an existing populated set without visible heading focus, including after Preview', async () => {
    const course = await setup();
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    draft.content.title = 'Cells';
    draft.content.questions[0].prompt = 'Existing question';
    await saveQuestionSetDraft(draft, { expectedDraftRevisionId: draft.draftRevisionId });
    open(course.id);
    const title = await screen.findByRole('heading', { name: 'Cells', level: 1 });
    expect(title).not.toHaveFocus();
    expect(screen.getByLabelText('Q1 question')).not.toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to composer' }));
    expect(title).not.toHaveFocus();
  });
  it('autosaves incomplete work and publishes a single-point marks override', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), {
      target: { value: 'Name the organelle.' },
    });
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), { target: { value: 'Nucleus' } });
    fireEvent.change(screen.getByLabelText('Q1 marks'), { target: { value: '2' } });
    await waitFor(async () =>
      expect(
        (await loadQuestionSetDraft(course.id, 'paper-set'))?.content.questions[0].answer?.maxMarks,
      ).toBe(2),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set details' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cells' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.keyDown(screen.getByLabelText('Q1 question'), { key: 'Enter', ctrlKey: true });
    expect(await screen.findByText('Published overview')).toBeVisible();
    expect(
      (await db.questionSets.get('paper-set'))?.questions[0].answer?.allocations[0].maxMarks,
    ).toBe(2);
    expect(await loadQuestionSetDraft(course.id, 'paper-set')).toBeNull();
  });
  it('focuses the first bad row on publish and shows inline validation', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Q1 question');
    fireEvent.click(screen.getByRole('button', { name: 'Set details' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cells' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));
    expect(screen.getByLabelText('Q1 question')).toHaveFocus();
    expect(screen.getByText('Question 1: Write the question or shared source.')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Review your question set' }),
    ).not.toBeInTheDocument();
  });
  it('delays missing-scheme and mismatched-total warnings until focus leaves the row', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), {
      target: { value: 'Explain.' },
    });
    expect(screen.queryByText('Needs a mark scheme')).not.toBeInTheDocument();
    screen.getByRole('button', { name: '+ Question' }).focus();
    expect(await screen.findByText('Needs a mark scheme')).toBeVisible();
    screen.getByLabelText('Q1 mark scheme').focus();
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), {
      target: { value: 'First\nSecond' },
    });
    fireEvent.change(screen.getByLabelText('Q1 marks'), { target: { value: '3' } });
    expect(screen.queryByText('Points add up to 2, not 3')).not.toBeInTheDocument();
    screen.getByRole('button', { name: '+ Question' }).focus();
    expect(await screen.findByText('Points add up to 2, not 3')).toBeVisible();
  });
  it('opens the row menu from a field and confirms discarding populated MCQ options', async () => {
    const course = await setup();
    open(course.id);
    const question = await screen.findByLabelText('Q1 question');
    fireEvent.keyDown(question, { key: 'F10', shiftKey: true });
    expect(await screen.findByRole('menuitem', { name: 'Multiple choice' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Multiple choice' }));
    fireEvent.change(screen.getByLabelText('Option 1', { exact: true }), {
      target: { value: 'Nucleus' },
    });
    fireEvent.change(screen.getByLabelText('Option 2', { exact: true }), {
      target: { value: 'Cell wall' },
    });
    fireEvent.click(screen.getByLabelText('Option 1 is correct'));
    fireEvent.keyDown(question, { key: 'ContextMenu' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Written' }));
    expect(screen.getByText('Remove the existing answer options?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Option 1', { exact: true })).toHaveValue('Nucleus');
  });
  it('ignores composition and already-consumed shortcuts', async () => {
    const course = await setup();
    open(course.id);
    const question = await screen.findByLabelText('Q1 question');
    for (const extra of [{ isComposing: true }, { keyCode: 229 }]) {
      fireEvent.keyDown(question, { key: 'Enter', ctrlKey: true, ...extra });
      fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter', ...extra });
    }
    screen
      .getByLabelText('Q1 marks')
      .addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    expect(screen.queryByLabelText('Q2 question')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Set details' })).not.toBeInTheDocument();
  });

  it('keeps guidance, dimensions and concept links when line text changes', async () => {
    const course = await setup();
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    draft.content.title = 'Cells';
    draft.content.questions[0].answer = {
      maxMarks: 2,
      response: { kind: 'written' },
      prerequisiteConceptIds: ['prerequisite'],
      allocations: [
        {
          id: 'point',
          criterion: 'Original',
          maxMarks: 2,
          dimension: 'application',
          targetConceptIds: ['concept'],
          explanation: 'Accept equivalent wording.',
        },
      ],
    };
    await saveQuestionSetDraft(draft, { expectedDraftRevisionId: draft.draftRevisionId });
    open(course.id);
    const scheme = await screen.findByLabelText('Q1 mark scheme');
    fireEvent.change(scheme, { target: { value: 'Rewritten (2)' } });
    await waitFor(async () =>
      expect(
        (await loadQuestionSetDraft(course.id, 'paper-set'))?.content.questions[0].answer
          ?.allocations[0],
      ).toEqual({
        id: 'point',
        criterion: 'Rewritten',
        maxMarks: 2,
        dimension: 'application',
        targetConceptIds: ['concept'],
        explanation: 'Accept equivalent wording.',
      }),
    );
  });
  it('clearing a marks override restores the authored line weight', async () => {
    const course = await setup();
    open(course.id);
    const scheme = await screen.findByLabelText('Q1 mark scheme');
    fireEvent.change(scheme, { target: { value: 'A weighted point (2)' } });
    const marks = screen.getByLabelText('Q1 marks');
    fireEvent.change(marks, { target: { value: '4' } });
    expect(marks).toHaveAttribute('placeholder', '2');
    fireEvent.change(marks, { target: { value: '' } });
    await waitFor(async () =>
      expect(
        (await loadQuestionSetDraft(course.id, 'paper-set'))?.content.questions[0].answer
          ?.allocations[0].maxMarks,
      ).toBe(2),
    );
  });
  it('preserves lesson and exam settings behind Set details without a covers line', async () => {
    const course = await setup();
    const lesson = await createLesson(course.id, 'Cell structure');
    const exam = await createCourseAssessment(course.id, 'Mock exam', Date.now() + 86_400_000);
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    draft.content.lessonIds = [lesson.id];
    draft.content.assessmentIds = [exam.id];
    await saveQuestionSetDraft(draft, { expectedDraftRevisionId: draft.draftRevisionId });
    open(course.id);
    await screen.findByLabelText('Q1 question');
    expect(screen.queryByText(/Covers|Not linked to lessons/)).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Set details' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Set details' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Set details' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Lessons and exams' })).toBeVisible();
    expect(await screen.findByRole('checkbox', { name: 'Cell structure' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Mock exam/ })).toBeChecked();
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Set details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set details' })).toHaveFocus();
  });
  it('does not open authoring controls for a locked course', async () => {
    const course = await setup();
    const stored = await db.courses.get(course.id);
    await db.courses.put({ ...stored!, distributedCopy: { locked: true } } as never);
    open(course.id);
    expect(await screen.findByText(/This course is read-only/)).toBeVisible();
    expect(screen.queryByLabelText('Q1 question')).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Q1 question')).toHaveValue('');
    expect(screen.getByLabelText('Q1 question')).toHaveFocus();
  });
  it('undoes scheme transfer without discarding later text or other questions', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), {
      target: { value: 'Original' },
    });
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), {
      target: { value: 'Retained scheme' },
    });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'Tab' });
    fireEvent.change(screen.getByLabelText('Q1 (a) question'), {
      target: { value: 'Later child text' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Question' }));
    fireEvent.change(screen.getByLabelText('Q2 question'), {
      target: { value: 'Another question' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Q1 mark scheme')).toHaveValue('Retained scheme');
    expect(screen.getByLabelText('Q2 question')).toHaveValue('Later child text');
    expect(screen.getByLabelText('Q3 question')).toHaveValue('Another question');
  });
  it('moves sibling rows from their fields using Alt and the arrow keys', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), { target: { value: 'First' } });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Q2 question'), { target: { value: 'Second' } });
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'ArrowUp', altKey: true });
    expect(screen.getByLabelText('Q1 question')).toHaveValue('Second');
    expect(screen.getByLabelText('Q1 question')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Q1 question'), { key: 'ArrowDown', altKey: true });
    expect(screen.getByLabelText('Q2 question')).toHaveValue('Second');
  });
  it('keeps deletion confirmation shortcuts inside the decision', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), {
      target: { value: 'Keep this' },
    });
    fireEvent.keyDown(screen.getByLabelText('Q1 question'), { key: 'F10', shiftKey: true });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Enter', ctrlKey: true });
    expect(cancel).toBeInTheDocument();
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Q1 question')).toHaveValue('Keep this');
  });
  it('keeps a valid stem if another part was added before undoing indentation', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), { target: { value: 'Source' } });
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), {
      target: { value: 'Retained scheme' },
    });
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Q2 question'), { key: 'Tab' });
    fireEvent.change(screen.getByLabelText('Q1 (a) question'), { target: { value: 'Part A' } });
    fireEvent.keyDown(screen.getByLabelText('Q1 (a) marks'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Q1 (b) question'), { target: { value: 'Part B' } });
    fireEvent.change(screen.getByLabelText('Q1 (b) mark scheme'), {
      target: { value: 'Another scheme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Q1 (a) question')).toHaveValue('Part B');
    expect(screen.getByLabelText('Q2 mark scheme')).toHaveValue('Retained scheme');
    await waitFor(async () =>
      expect(
        (await loadQuestionSetDraft(course.id, 'paper-set'))?.content.questions[0].answer,
      ).toBeUndefined(),
    );
  });
});
