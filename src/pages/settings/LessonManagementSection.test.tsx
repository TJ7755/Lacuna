import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonManagementSection } from './LessonManagementSection';
import type { Lesson } from '../../db/types';

let mockLessons: Lesson[] | undefined;

vi.mock('../../state/useCourseData', () => ({
  useLessons: () => mockLessons,
}));

const updateLesson = vi.fn().mockResolvedValue(undefined);
const deleteLesson = vi.fn().mockResolvedValue(undefined);
const reorderLessons = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/repository', () => ({
  updateLesson: (...args: unknown[]) => updateLesson(...args),
  deleteLesson: (...args: unknown[]) => deleteLesson(...args),
  reorderLessons: (...args: unknown[]) => reorderLessons(...args),
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('deletes a lesson after confirmation', () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Delete Lesson one'));
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1');
  });

  it('renames a lesson on blur', () => {
    render(<LessonManagementSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Rename Lesson one'));
    const input = screen.getByDisplayValue('Lesson one');
    fireEvent.change(input, { target: { value: 'Renamed lesson' } });
    fireEvent.blur(input);
    expect(updateLesson).toHaveBeenCalledWith('lesson-1', { name: 'Renamed lesson' });
  });
});
