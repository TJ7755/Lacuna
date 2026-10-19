import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TeacherCourses } from './TeacherCourses';

const { store } = vi.hoisted(() => ({
  store: { list: vi.fn(), connect: vi.fn(), forget: vi.fn(), close: vi.fn() },
}));
vi.mock('./connectionStore', () => ({ createGapsConnectionStore: () => store }));
beforeEach(() => {
  vi.clearAllMocks();
  store.list.mockResolvedValue([]);
  store.connect.mockReset();
});

it('shows saved courses and offers key setup for the selected course', async () => {
  const shareId = 'a'.repeat(32),
    onPrepareKey = vi.fn(),
    onOpenClass = vi.fn();
  store.list.mockResolvedValue([{ shareId, courseName: 'GCSE Biology', verifiedAt: Date.now() }]);
  render(
    <TeacherCourses onPrepareKey={onPrepareKey} onOpenClass={onOpenClass} keySetupOpen={false} />,
  );
  expect(await screen.findByRole('heading', { name: 'GCSE Biology' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open class' }));
  expect(onOpenClass).toHaveBeenCalledWith(expect.objectContaining({ shareId }));
  fireEvent.click(screen.getByText('Class setup and connection'));
  fireEvent.click(screen.getByRole('button', { name: 'Set up or restore this class' }));
  expect(onPrepareKey).toHaveBeenCalledWith(expect.objectContaining({ shareId }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }));
  expect(store.forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep connection' }));
  expect(store.forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(store.forget).toHaveBeenCalledWith(shareId));
  expect(await screen.findByRole('heading', { name: 'Connect your first class' })).toBeVisible();
});

it('reports a rejected connection without claiming success and clears its passphrase', async () => {
  store.connect.mockRejectedValue(new Error('decrypt failed'));
  render(<TeacherCourses onPrepareKey={vi.fn()} onOpenClass={vi.fn()} keySetupOpen={false} />);
  await screen.findByRole('heading', { name: 'Connect your first class' });
  fireEvent.click(screen.getByRole('button', { name: 'Connect a class' }));
  fireEvent.change(screen.getByLabelText(/^Encrypted connection file/), {
    target: { files: [new File(['{}'], 'course.json')] },
  });
  fireEvent.change(screen.getByLabelText('Connection passphrase'), {
    target: { value: 'my connection phrase' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Connect a class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/passphrase/);
  expect(screen.getByLabelText('Connection passphrase')).toHaveValue('');
  expect(screen.queryByText('Course connected.')).not.toBeInTheDocument();
});
