import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createEmptyQuestionSetDraft, saveQuestionSetDraft } from '../questions/questionSetDrafts';
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

export async function setup() {
  const course = await createCourse('Biology');
  await db.courses.update(course.id, { lessonViewMode: 'edit' });
  const draft = createEmptyQuestionSetDraft(course.id, 'paper-set');
  draft.content.questions = [{ id: 'q1', prompt: '', parts: [] }];
  await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  return course;
}
export function open(courseId: string, path = 'question-sets/paper-set/edit') {
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
export async function resetEditorData() {
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
}
