import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddLessonControl, defaultLessonName } from './AddLessonControl';

const createLesson = vi.fn().mockResolvedValue({
  id: 'lesson-new',
  courseId: 'course-1',
  name: 'Lesson 2',
  orderIndex: 1,
  isExtension: false,
  createdAt: Date.now(),
});

vi.mock('../../db/repository', () => ({
  createLesson: (...args: unknown[]) => createLesson(...args),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

describe('defaultLessonName', () => {
  it('suggests the next lesson number', () => {
    expect(defaultLessonName(0)).toBe('Lesson 1');
    expect(defaultLessonName(1)).toBe('Lesson 2');
    expect(defaultLessonName(5)).toBe('Lesson 6');
  });
});

describe('AddLessonControl', () => {
  it('creates a lesson and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<AddLessonControl courseId="course-1" lessonCount={1} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: /add lesson/i }));
    expect(screen.getByDisplayValue('Lesson 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create lesson/i }));

    await vi.waitFor(() => {
      expect(createLesson).toHaveBeenCalledWith('course-1', 'Lesson 2');
      expect(onCreated).toHaveBeenCalled();
    });
  });
});
