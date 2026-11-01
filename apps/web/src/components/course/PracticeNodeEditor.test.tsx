import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Lesson, PracticeNode } from '@lacuna/core/db/types';
import { PracticeNodeEditor } from './PracticeNodeEditor';
import { updatePracticeNode } from '../../db/practiceNodeRepository';
import { ToastProvider } from '../ui/Toast';
vi.mock('../../db/practiceNodeRepository', () => ({
  createPracticeNode: vi.fn(),
  updatePracticeNode: vi.fn(),
  deletePracticeNode: vi.fn(),
}));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
const lessons = [{ id: 'lesson', courseId: 'course', name: 'Atoms', orderIndex: 0 }] as Lesson[];
const node = {
  id: 'practice',
  courseId: 'course',
  type: 'manual',
  name: 'Weekly review',
  position: 0,
} as PracticeNode;
it('edits practice as a sentence, preserves its anchor and saves with Done', async () => {
  render(
    <ToastProvider>
      <PracticeNodeEditor courseId="course" lessons={lessons} node={node} onSaved={vi.fn()} />
    </ToastProvider>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Friday review' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'lesson' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'lesson' })).getByRole('button', { name: 'Random' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(updatePracticeNode).toHaveBeenCalledWith(
      'practice',
      expect.objectContaining({ name: 'Friday review', position: 0, randomize: true }),
    ),
  );
});
