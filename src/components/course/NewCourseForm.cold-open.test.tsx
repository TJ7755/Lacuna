import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NewCourseForm } from './NewCourseForm';

vi.mock('../../routes/prefetch', () => ({ prefetchRoute: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
// Keep the real lazy boundary pending to exercise a slow chunk download.
vi.mock('../import/CourseLibraryImport', () => new Promise(() => {}));

it.each([true, false])('keeps a way back while the library loads (inline=%s)', async (inline) => {
  const onClose = vi.fn();
  render(<NewCourseForm inline={inline} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /Course library/ }));

  const back = screen.getByRole('button', { name: 'Back to New course' });
  expect(back).toHaveFocus();
  fireEvent.keyDown(back, { key: 'Escape' });
  await waitFor(() => expect(screen.getByLabelText('Course name')).toBeVisible());
  expect(screen.getByRole('button', { name: /Course library/ })).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /Course library/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to New course' }));
  expect(screen.getByRole('button', { name: /Course library/ })).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
});
