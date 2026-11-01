import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Card, CourseAssessment, Lesson } from '@lacuna/core/db/types';
import { ToastProvider } from '../ui/Toast';
import { AssessmentPathEditor } from './AssessmentPathEditor';
import { updateCourseAssessment, deleteCourseAssessment } from '../../db/assessmentRepository';
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
vi.mock('../../db/assessmentRepository', () => ({
  createCourseAssessment: vi.fn(),
  updateCourseAssessment: vi.fn(),
  deleteCourseAssessment: vi.fn(),
}));
const lessons: Lesson[] = [
  {
    id: 'l1',
    courseId: 'course',
    name: 'Atoms',
    orderIndex: 0,
    isExtension: false,
    createdAt: 1,
    updatedAt: 1,
  },
];
const cards = [
  {
    id: 'c1',
    courseId: 'course',
    primaryLessonId: 'l1',
    front: 'What is a proton?',
    back: 'Positive charge',
    type: 'front_back',
  },
] as Card[];
const assessment: CourseAssessment = {
  id: 'exam',
  courseId: 'course',
  kind: 'checkpoint',
  name: 'Mid-course check',
  examDate: Date.now(),
  afterLessonId: 'l1',
  coverageMode: 'prefix',
  excludedCardIds: [],
  createdAt: 1,
  updatedAt: 1,
};
function editor(kind: 'checkpoint' | 'final' = 'checkpoint') {
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <AssessmentPathEditor
        courseId="course"
        assessment={{ ...assessment, kind }}
        lessons={lessons}
        cards={cards}
        links={[]}
        onSaved={onSaved}
      />
    </ToastProvider>,
  );
  return onSaved;
}
beforeEach(() => vi.clearAllMocks());
it('saves a name edited in the sentence with Done', async () => {
  editor();
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Paper one' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(updateCourseAssessment).toHaveBeenCalledWith(
      'exam',
      expect.objectContaining({ name: 'Paper one' }),
    ),
  );
  expect(screen.queryByLabelText('Path position')).not.toBeInTheDocument();
});
it('toggles excluded cards in a picker and adds the except chip to the sentence', async () => {
  editor();
  fireEvent.click(screen.getByRole('button', { name: 'Leave some cards out' }));
  const picker = screen.getByRole('dialog', { name: 'Excluded cards' });
  const card = within(picker).getByRole('button', { name: 'What is a proton?' });
  fireEvent.click(card);
  expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(within(picker).getByText('Excluded')).toBeVisible();
  expect(screen.getByRole('button', { name: '1 card' })).toBeVisible();
  fireEvent.keyDown(card, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(updateCourseAssessment).toHaveBeenCalledWith(
      'exam',
      expect.objectContaining({ excludedCardIds: ['c1'] }),
    ),
  );
});
it('keeps an empty name open on Escape and focuses the field', async () => {
  const saved = editor();
  const name = screen.getByRole('textbox', { name: 'Name' });
  fireEvent.change(name, { target: { value: ' ' } });
  fireEvent.keyDown(name, { key: 'Escape' });
  await screen.findByText('Enter a name.');
  expect(name).toHaveFocus();
  expect(saved).not.toHaveBeenCalled();
  expect(updateCourseAssessment).not.toHaveBeenCalled();
});
it('requires anchored confirmation before deleting a checkpoint', async () => {
  editor();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteCourseAssessment).not.toHaveBeenCalled();
  const confirmation = screen.getByRole('dialog', { name: 'Delete' });
  expect(within(confirmation).getByText('Delete this checkpoint?')).toBeVisible();
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(deleteCourseAssessment).toHaveBeenCalledWith('exam'));
});
it('never offers deletion of the final assessment', () => {
  editor('final');
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
});
