import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExamDatesSection } from './ExamDatesSection';
import type { Card, CourseAssessment, Lesson } from '../../db/types';

let mockExamDates: CourseAssessment[] | undefined;
let mockLessons: Lesson[] | undefined;
let mockCards: Card[] | undefined;

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));

vi.mock('../../state/useCourseData', () => ({
  useCourseAssessments: () => mockExamDates,
  useLessons: () => mockLessons,
  useCourseCards: () => mockCards,
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

const mockCard = {
  id: 'card-1',
  courseId: 'course-1',
  primaryLessonId: 'lesson-1',
  front: 'Question',
  back: 'Answer',
  type: 'front_back',
  deckId: 'deck-1',
  tags: [],
  createdAt: Date.now(),
  state: 0,
  stability: null,
  difficulty: null,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  history: [],
} as Card;

describe('ExamDatesSection', () => {
  beforeEach(() => {
    mockExamDates = [mockExamDate];
    mockLessons = [mockLesson];
    mockCards = [mockCard];
    createCourseAssessment.mockClear();
    updateCourseAssessment.mockClear();
    deleteCourseAssessment.mockClear();
  });

  it('lists existing exam dates', () => {
    render(<ExamDatesSection courseId="course-1" />);
    expect(screen.getByText('Mock exam')).toBeInTheDocument();
  });

  it('deletes an exam date after confirmation', async () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByLabelText('Delete Mock exam'));
    expect(deleteCourseAssessment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Yes'));
    await waitFor(() => expect(deleteCourseAssessment).toHaveBeenCalledWith('exam-1'));
  });

  it('opens the add form and creates a new exam date', async () => {
    render(<ExamDatesSection courseId="course-1" />);
    fireEvent.click(screen.getByText('Add checkpoint'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Mock exam'), {
      target: { value: 'Final' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(createCourseAssessment).toHaveBeenCalledWith(
        'course-1',
        'Final',
        expect.any(Number),
        expect.objectContaining({
          afterLessonId: 'lesson-1',
          coverageMode: 'prefix',
          excludedCardIds: [],
        }),
      ),
    );
  });

  it('edits the sole final with the same assessment editor and offers no delete action', () => {
    mockExamDates = [{ ...mockExamDate, id: 'final-1', kind: 'final', name: 'Final assessment' }];
    render(<ExamDatesSection courseId="course-1" />);
    expect(screen.queryByLabelText('Delete Final assessment')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Edit Final assessment'));
    expect(screen.getByText('Path position')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
  });
});
