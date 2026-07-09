import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExamDatesSection } from './ExamDatesSection';
import type { CourseExamDate, Lesson } from '../../db/types';

let mockExamDates: CourseExamDate[] | undefined;
let mockLessons: Lesson[] | undefined;

vi.mock('../../state/useCourseData', () => ({
  useCourseExamDates: () => mockExamDates,
  useLessons: () => mockLessons,
}));

const createCourseExamDate = vi.fn().mockResolvedValue(undefined);
const updateCourseExamDate = vi.fn().mockResolvedValue(undefined);
const deleteCourseExamDate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/repository', () => ({
  createCourseExamDate: (...args: unknown[]) => createCourseExamDate(...args),
  updateCourseExamDate: (...args: unknown[]) => updateCourseExamDate(...args),
  deleteCourseExamDate: (...args: unknown[]) => deleteCourseExamDate(...args),
}));

const mockLesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Lesson one',
  orderIndex: 0,
  isExtension: false,
  createdAt: Date.now(),
};

const mockExamDate: CourseExamDate = {
  id: 'exam-1',
  courseId: 'course-1',
  name: 'Mock exam',
  examDate: Date.now() + 1000,
  createdAt: Date.now(),
};

describe('ExamDatesSection', () => {
  beforeEach(() => {
    mockExamDates = [mockExamDate];
    mockLessons = [mockLesson];
    createCourseExamDate.mockClear();
    updateCourseExamDate.mockClear();
    deleteCourseExamDate.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists existing exam dates', () => {
    render(<ExamDatesSection courseId="course-1" />);
    expect(screen.getByText('Mock exam')).toBeInTheDocument();
  });

  it('deletes an exam date after confirmation', () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Delete Mock exam'));
    expect(deleteCourseExamDate).toHaveBeenCalledWith('exam-1');
  });

  it('opens the add form and creates a new exam date', () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByText('Add date'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Mock exam'), {
      target: { value: 'Final' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(createCourseExamDate).toHaveBeenCalledWith(
      'course-1',
      'Final',
      expect.any(Number),
      expect.objectContaining({ lessonIds: undefined }),
    );
  });
});
