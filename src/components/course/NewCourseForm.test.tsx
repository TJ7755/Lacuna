import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCourseForm } from './NewCourseForm';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notify: vi.fn(),
  createCourse: vi.fn(),
  createLesson: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../db/repository', () => ({
  createCourse: mocks.createCourse,
  createLesson: mocks.createLesson,
}));
vi.mock('../import/UnifiedImportPanel', () => ({
  ShareCodeImportPanel: ({
    onShareImport,
  }: {
    onShareImport: (courses: number, cards: number, courseIds: string[]) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onShareImport(1, 2, ['imported-course'])}>
      Complete share import
    </button>
  ),
}));

describe('NewCourseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCourse.mockResolvedValue({ id: 'new-course' });
    mocks.createLesson.mockResolvedValue({ id: 'new-lesson' });
  });

  it('keeps ordinary course creation as the default path', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledWith('Biology'));
    expect(mocks.createLesson).toHaveBeenCalledWith('new-course', 'Lesson 1');
    expect(mocks.navigate).toHaveBeenCalledWith('/course/new-course');
  });

  it('offers share-code import and opens the imported course', async () => {
    const onClose = vi.fn();
    render(<NewCourseForm onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import share code' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete share import' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.notify).toHaveBeenCalledWith('Added 1 course and 2 cards.', 'positive');
    expect(mocks.navigate).toHaveBeenCalledWith('/course/imported-course');
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });
});
