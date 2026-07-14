import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '../../db/types';
import { moveLessonIds, useLessonPathReorder } from './useLessonPathReorder';

const reorderLessons = vi.fn().mockResolvedValue(undefined);
const hapticStrong = vi.fn();

vi.mock('../../db/repository', () => ({
  reorderLessons: (...args: unknown[]) => reorderLessons(...args),
}));

vi.mock('../../utils/haptic', () => ({
  hapticStrong: () => hapticStrong(),
}));

const lessons: Lesson[] = ['One', 'Two', 'Three'].map((name, index) => ({
  id: `lesson-${index + 1}`,
  courseId: 'course-1',
  name,
  orderIndex: index,
  isExtension: false,
  createdAt: 1,
}));

function Harness({
  enabled = true,
  onError = vi.fn(),
  onOpen = vi.fn(),
}: {
  enabled?: boolean;
  onError?: (message: string) => void;
  onOpen?: (lessonId: string) => void;
}) {
  const reorder = useLessonPathReorder({
    courseId: 'course-1',
    lessons,
    enabled,
    onError,
  });
  return (
    <>
      {lessons.map((lesson) => {
        const interaction = reorder.interactionFor(lesson.id);
        return (
          <button
            key={lesson.id}
            ref={interaction.registerElement}
            onPointerDown={interaction.onPointerDown}
            onPointerMove={interaction.onPointerMove}
            onPointerUp={interaction.onPointerUp}
            onPointerCancel={interaction.onPointerCancel}
            onClickCapture={interaction.onClickCapture}
            onClick={() => onOpen(lesson.id)}
            onKeyDown={interaction.onKeyDown}
            data-lifted={interaction.lifted || undefined}
            data-drop-marker={interaction.dropMarker}
          >
            {lesson.name}
          </button>
        );
      })}
      <output>{reorder.announcement}</output>
    </>
  );
}

describe('moveLessonIds', () => {
  it('moves a lesson against the remaining lesson positions', () => {
    expect(moveLessonIds(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveLessonIds(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveLessonIds(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps boundaries and ignores an unknown lesson', () => {
    expect(moveLessonIds(['a', 'b', 'c'], 'b', -4)).toEqual(['b', 'a', 'c']);
    expect(moveLessonIds(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    const ids = ['a', 'b'];
    expect(moveLessonIds(ids, 'missing', 0)).toBe(ids);
  });
});

describe('useLessonPathReorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reorderLessons.mockReset();
    reorderLessons.mockResolvedValue(undefined);
    hapticStrong.mockClear();
  });

  it('activates after a hold and persists the lesson-only drop position', async () => {
    render(<Harness />);
    const first = screen.getByRole('button', { name: 'One' });

    fireEvent.pointerDown(first, { button: 0, pointerId: 7, clientX: 10, clientY: 10 });
    await act(async () => vi.advanceTimersByTime(350));
    expect(hapticStrong).toHaveBeenCalledOnce();

    await act(async () => {
      fireEvent.pointerMove(first, { pointerId: 7, clientX: 10, clientY: 100 });
      fireEvent.pointerUp(first, { pointerId: 7, clientX: 10, clientY: 100 });
      await Promise.resolve();
    });
    expect(reorderLessons).toHaveBeenCalledWith('course-1', [
      'lesson-2',
      'lesson-3',
      'lesson-1',
    ]);
    expect(screen.getByText('One moved to position 3 of 3.')).toBeInTheDocument();
  });

  it('cancels a hold when the pointer moves before activation', async () => {
    render(<Harness />);
    const first = screen.getByRole('button', { name: 'One' });

    fireEvent.pointerDown(first, { button: 0, pointerId: 8, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(first, { pointerId: 8, clientX: 20, clientY: 0 });
    await act(async () => vi.advanceTimersByTime(350));
    fireEvent.pointerUp(first, { pointerId: 8, clientX: 20, clientY: 0 });

    expect(hapticStrong).not.toHaveBeenCalled();
    expect(reorderLessons).not.toHaveBeenCalled();
  });

  it('clears lifted state on Escape and suppresses the long-press click', async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    const first = screen.getByRole('button', { name: 'One' });
    fireEvent.pointerDown(first, { button: 0, pointerId: 10, clientX: 0, clientY: 0 });
    await act(async () => vi.advanceTimersByTime(350));

    expect(first).toHaveAttribute('data-lifted', 'true');
    fireEvent.click(first);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(first).not.toHaveAttribute('data-lifted');
    expect(screen.getByText('One move cancelled.')).toBeInTheDocument();
    expect(reorderLessons).not.toHaveBeenCalled();
  });

  it('clears lifted and drop state on pointer cancellation', async () => {
    render(<Harness />);
    const first = screen.getByRole('button', { name: 'One' });
    const third = screen.getByRole('button', { name: 'Three' });
    fireEvent.pointerDown(first, { button: 0, pointerId: 11, clientX: 0, clientY: 0 });
    await act(async () => vi.advanceTimersByTime(350));
    fireEvent.pointerMove(first, { pointerId: 11, clientX: 0, clientY: 100 });

    expect(third).toHaveAttribute('data-drop-marker', 'after');
    fireEvent.pointerCancel(first, { pointerId: 11 });

    expect(first).not.toHaveAttribute('data-lifted');
    expect(third).not.toHaveAttribute('data-drop-marker');
    expect(reorderLessons).not.toHaveBeenCalled();
  });

  it('supports Alt+Arrow keyboard moves and announces the result', async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Two' }), {
        key: 'ArrowUp',
        altKey: true,
      });
      await Promise.resolve();
    });
    expect(reorderLessons).toHaveBeenCalledWith('course-1', [
      'lesson-2',
      'lesson-1',
      'lesson-3',
    ]);
    expect(screen.getByText('Two moved to position 1 of 3.')).toBeInTheDocument();
  });

  it('does not reorder outside Edit mode', async () => {
    render(<Harness enabled={false} />);
    const first = screen.getByRole('button', { name: 'One' });
    fireEvent.pointerDown(first, { button: 0, pointerId: 9, clientX: 0, clientY: 0 });
    await act(async () => vi.advanceTimersByTime(350));
    fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });

    expect(hapticStrong).not.toHaveBeenCalled();
    expect(reorderLessons).not.toHaveBeenCalled();
  });

  it('reports persistence failures', async () => {
    const onError = vi.fn();
    reorderLessons.mockRejectedValueOnce(new Error('write failed'));
    render(<Harness onError={onError} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Two' }), {
        key: 'ArrowDown',
        altKey: true,
      });
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledWith('Lesson order could not be saved.');
    expect(screen.getByText('Lesson order could not be saved.')).toBeInTheDocument();
  });
});
