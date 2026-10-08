import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { AddLessonControl, defaultLessonName } from './AddLessonControl';
import { domAnimation, LazyMotion } from 'motion/react';

const motionPreference = vi.hoisted(() => ({ multiplier: 0 }));
beforeEach(() => {
  motionPreference.multiplier = 0;
  createLesson.mockClear();
});

const createLesson = vi.fn().mockResolvedValue({
  id: 'lesson-new',
  courseId: 'course-1',
  name: 'Lesson 2',
  orderIndex: 1,
  isExtension: false,
  createdAt: Date.now(),
  updatedAt: 1,
});

vi.mock('../../db/lessonRepository', () => ({
  createLesson: (...args: unknown[]) => createLesson(...args),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => motionPreference.multiplier,
}));

describe('defaultLessonName', () => {
  it('suggests the next lesson number', () => {
    expect(defaultLessonName(0)).toBe('Lesson 1');
    expect(defaultLessonName(1)).toBe('Lesson 2');
    expect(defaultLessonName(5)).toBe('Lesson 6');
  });
});

describe('AddLessonControl', () => {
  it('does not create a second lesson when Enter repeats while creation is pending', async () => {
    let finish!: (lesson: { id: string }) => void;
    createLesson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<AddLessonControl courseId="course-1" lessonCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    const input = screen.getByRole('textbox', { name: 'Lesson name' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(createLesson).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ id: 'lesson-new' });
    });
  });

  it('refocuses the existing name field when reopened before its exit finishes', async () => {
    motionPreference.multiplier = 1;
    render(
      <LazyMotion features={domAnimation}>
        <AddLessonControl courseId="course-1" lessonCount={1} />
      </LazyMotion>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    const name = screen.getByRole('textbox', { name: 'Lesson name' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const trigger = screen.getByRole('button', { name: 'Add lesson' });
    trigger.focus();
    fireEvent.click(trigger);
    const reopened = screen.getByRole('textbox', { name: 'Lesson name' });
    expect(reopened).toBe(name);
    expect(reopened).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  });
  it('cancels with Escape from any form control and returns focus to Add lesson', async () => {
    render(<AddLessonControl courseId="course-1" lessonCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Add lesson' })).toHaveFocus();
  });
  it('creates a lesson and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<AddLessonControl courseId="course-1" lessonCount={1} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: /add lesson/i }));
    expect(screen.getByDisplayValue('Lesson 2')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create lesson/i }));

      await vi.waitFor(() => {
        expect(createLesson).toHaveBeenCalledWith('course-1', 'Lesson 2');
        expect(onCreated).toHaveBeenCalled();
      });
      await Promise.resolve(createLesson.mock.results[0]?.value);
    });
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /add lesson/i })).toBeInTheDocument();
    });
  });
});

it('offers an import into a new lesson without creating it before confirmation', async () => {
  createLesson.mockClear();
  render(<AddLessonControl courseId="course-1" lessonCount={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import cards' }));
  // The importer is a lazy chunk, and its first load can be slow on a cold run.
  expect(await screen.findByLabelText('Lesson title', {}, { timeout: 5000 })).toHaveValue(
    'Lesson 2',
  );
  expect(screen.getByLabelText('Paste your cards')).toHaveValue('');
  expect(createLesson).not.toHaveBeenCalled();
});
