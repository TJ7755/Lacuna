import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DetachCourseSection } from './DetachCourseSection';

const detachCourse = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/repository', () => ({
  detachCourse: (...args: unknown[]) => detachCourse(...args),
}));

const notify = vi.fn();
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

describe('DetachCourseSection', () => {
  beforeEach(() => {
    detachCourse.mockClear();
    notify.mockClear();
  });

  it('shows the explanatory line and a secondary Detach course button', () => {
    render(<DetachCourseSection courseId="course-1" />);
    expect(
      screen.getByText(
        'This course is managed by its author. Detach it to edit freely — future updates from them will arrive as a separate course instead of merging.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach course' })).toBeInTheDocument();
  });

  it('asks for confirmation before detaching, and calls detachCourse only on confirm', async () => {
    render(<DetachCourseSection courseId="course-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Detach course' }));

    expect(screen.getByText('Detach this course?')).toBeInTheDocument();
    expect(detachCourse).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Detach' }));
      await Promise.resolve();
    });

    expect(detachCourse).toHaveBeenCalledWith('course-1');
    expect(notify).toHaveBeenCalledWith('Course detached. You can now edit it freely.', 'neutral');
  });

  it('cancels back to the trigger button without detaching', () => {
    render(<DetachCourseSection courseId="course-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Detach course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Detach course' })).toBeInTheDocument();
    expect(detachCourse).not.toHaveBeenCalled();
  });
});
