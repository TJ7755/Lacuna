import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { LessonManagementSection } from './LessonManagementSection';
import type { Lesson } from '../../db/types';

let mockLessons: Lesson[] | undefined;

vi.mock('../../state/useCourseData', () => ({
  useLessons: () => mockLessons,
}));

const updateLesson = vi.fn().mockResolvedValue(undefined);
const deleteLesson = vi.fn().mockResolvedValue(undefined);
const reorderLessons = vi.fn().mockResolvedValue(undefined);
const createLesson = vi.fn().mockResolvedValue({
  id: 'lesson-new',
  courseId: 'course-1',
  name: 'Lesson 3',
  orderIndex: 2,
  isExtension: false,
  createdAt: Date.now(),
});

vi.mock('../../db/repository', () => ({
  updateLesson: (...args: unknown[]) => updateLesson(...args),
  deleteLesson: (...args: unknown[]) => deleteLesson(...args),
  reorderLessons: (...args: unknown[]) => reorderLessons(...args),
  createLesson: (...args: unknown[]) => createLesson(...args),
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

const lessonOne: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Lesson one',
  orderIndex: 0,
  isExtension: false,
  createdAt: Date.now(),
};
const lessonTwo: Lesson = {
  id: 'lesson-2',
  courseId: 'course-1',
  name: 'Lesson two',
  orderIndex: 1,
  isExtension: false,
  createdAt: Date.now(),
};

describe('LessonManagementSection', () => {
  beforeEach(() => {
    mockLessons = [lessonOne, lessonTwo];
    updateLesson.mockClear();
    deleteLesson.mockClear();
    reorderLessons.mockClear();
    createLesson.mockClear();
  });

  it('lists lessons in order', () => {
    render(<LessonManagementSection courseId="course-1" />);
    expect(screen.getByText('Lesson one')).toBeInTheDocument();
    expect(screen.getByText('Lesson two')).toBeInTheDocument();
  });

  it('reorders lessons on move down', () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Move Lesson one down'));
    expect(reorderLessons).toHaveBeenCalledWith('course-1', ['lesson-2', 'lesson-1']);
  });

  it('deletes a lesson after confirmation', async () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Delete Lesson one'));
    expect(deleteLesson).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText('Yes'));
      await vi.waitFor(() => {
        expect(deleteLesson).toHaveBeenCalledWith('lesson-1');
      });
      await Promise.resolve(deleteLesson.mock.results[0]?.value);
    });
    await vi.waitFor(() => {
      expect(screen.queryByText('Delete? Notes will be removed and cards unassigned.')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Delete Lesson one')).toBeInTheDocument();
    });
  });

  it('renames a lesson on blur', async () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Rename Lesson one'));
    const input = screen.getByDisplayValue('Lesson one');
    fireEvent.change(input, { target: { value: 'Renamed lesson' } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.waitFor(() => {
        expect(updateLesson).toHaveBeenCalledWith('lesson-1', { name: 'Renamed lesson' });
      });
      await Promise.resolve(updateLesson.mock.results[0]?.value);
    });
    await vi.waitFor(() => {
      expect(screen.queryByDisplayValue('Renamed lesson')).not.toBeInTheDocument();
    });
  });

  it('creates a lesson from the add form', async () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByRole('button', { name: /add lesson/i }));
    const input = screen.getByPlaceholderText('e.g. Elasticity');
    fireEvent.change(input, { target: { value: 'Lesson 3' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lesson/i }));
      await vi.waitFor(() => {
        expect(createLesson).toHaveBeenCalledWith('course-1', 'Lesson 3');
      });
      await Promise.resolve(createLesson.mock.results[0]?.value);
    });
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /add lesson/i })).toBeInTheDocument();
    });
  });
});
