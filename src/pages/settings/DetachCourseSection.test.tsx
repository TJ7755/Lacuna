import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DetachCourseSection } from './DetachCourseSection';

const detachCourse = vi.fn().mockResolvedValue(undefined);
const setCourseAutoAcceptUpdates = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/repository', () => ({
  detachCourse: (...args: unknown[]) => detachCourse(...args),
  setCourseAutoAcceptUpdates: (...args: unknown[]) => setCourseAutoAcceptUpdates(...args),
}));

const notify = vi.fn();
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

describe('DetachCourseSection', () => {
  beforeEach(() => {
    detachCourse.mockClear();
    setCourseAutoAcceptUpdates.mockClear();
    notify.mockClear();
  });

  it('shows the explanatory line and a secondary Detach course button', () => {
    render(<DetachCourseSection courseId="course-1" autoAcceptUpdates={false} />);
    expect(
      screen.getByText(
        'This course is managed by its author. Detach it to edit freely — future updates from them will arrive as a separate course instead of merging.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach course' })).toBeInTheDocument();
  });

  it('asks for confirmation before detaching, and calls detachCourse only on confirm', async () => {
    render(<DetachCourseSection courseId="course-1" autoAcceptUpdates={false} />);
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
    render(<DetachCourseSection courseId="course-1" autoAcceptUpdates={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detach course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Detach course' })).toBeInTheDocument();
    expect(detachCourse).not.toHaveBeenCalled();
  });

  it('shows the auto-accept toggle reflecting the current preference', () => {
    render(<DetachCourseSection courseId="course-1" autoAcceptUpdates={true} />);
    expect(screen.getByText('Apply updates automatically')).toBeInTheDocument();
    expect(
      screen.getByText(
        'New changes from the course author are applied without review. Changes that clash with your own edits still wait for you.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Apply updates automatically' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('commits the auto-accept toggle instantly on change', () => {
    render(<DetachCourseSection courseId="course-1" autoAcceptUpdates={false} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Apply updates automatically' }));
    expect(setCourseAutoAcceptUpdates).toHaveBeenCalledWith('course-1', true);
  });
});
