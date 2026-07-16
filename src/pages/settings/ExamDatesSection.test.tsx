import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExamDatesSection } from './ExamDatesSection';
import type { CourseAssessment, Lesson } from '../../db/types';

let mockExamDates: CourseAssessment[] | undefined;
let mockLessons: Lesson[] | undefined;

vi.mock('../../state/useCourseData', () => ({
  useCourseAssessments: () => mockExamDates,
  useLessons: () => mockLessons,
}));

const createCourseAssessment = vi.fn().mockResolvedValue(undefined);
const updateCourseAssessment = vi.fn().mockResolvedValue(undefined);
const deleteCourseAssessment = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/repository', () => ({
  createCourseAssessment: (...args: unknown[]) => createCourseAssessment(...args),
  updateCourseAssessment: (...args: unknown[]) => updateCourseAssessment(...args),
  deleteCourseAssessment: (...args: unknown[]) => deleteCourseAssessment(...args),
}));

const mockLesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Lesson one',
  orderIndex: 0,
  isExtension: false,
  createdAt: Date.now(),
};

const mockExamDate: CourseAssessment = {
  id: 'exam-1',
  courseId: 'course-1',
  name: 'Mock exam',
  kind: 'checkpoint',
  examDate: Date.now() + 1000,
  afterLessonId: 'lesson-1',
  coverageMode: 'prefix',
  excludedCardIds: [],
  createdAt: Date.now(),
};

describe('ExamDatesSection', () => {
  beforeEach(() => {
    mockExamDates = [mockExamDate];
    mockLessons = [mockLesson];
    createCourseAssessment.mockClear();
    updateCourseAssessment.mockClear();
    deleteCourseAssessment.mockClear();
  });

  it('lists existing exam dates', () => {
    render(<ExamDatesSection courseId="course-1" />);
    expect(screen.getByText('Mock exam')).toBeInTheDocument();
  });

  it('deletes an exam date after confirmation', () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Delete Mock exam'));
    expect(deleteCourseAssessment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Yes'));
    expect(deleteCourseAssessment).toHaveBeenCalledWith('exam-1');
  });

  it('opens the add form and creates a new exam date', () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByText('Add date'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Mock exam'), {
      target: { value: 'Final' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(createCourseAssessment).toHaveBeenCalledWith(
      'course-1',
      'Final',
      expect.any(Number),
      undefined,
    );
  });
});
