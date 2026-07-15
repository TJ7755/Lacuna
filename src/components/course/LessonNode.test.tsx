import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Lesson } from '../../db/types';
import { LessonNode } from './LessonNode';
import type { LessonReorderInteraction } from './useLessonPathReorder';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Locked lesson',
  orderIndex: 1,
  isExtension: false,
  createdAt: 1,
};

function reorderInteraction(): LessonReorderInteraction {
  return {
    enabled: true,
    lifted: false,
    dropMarker: undefined,
    registerElement: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onClickCapture: vi.fn(),
    onKeyDown: vi.fn(),
  };
}

describe('LessonNode authoring', () => {
  it('keeps a locked lesson inert in Read mode', () => {
    const onClick = vi.fn();
    render(
      <LessonNode
        lesson={lesson}
        status="locked"
        lockHint="Complete the previous lesson"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Locked lesson' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Complete the previous lesson');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens a curriculum-locked lesson for authoring in Edit mode', () => {
    const onClick = vi.fn();
    render(
      <LessonNode lesson={lesson} status="locked" authoring onClick={onClick} />,
    );

    const button = screen.getByRole('button', { name: 'Locked lesson, locked for study' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('title', 'Locked for study; open to edit');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes Edit-mode keyboard reordering without changing the open action', () => {
    const onClick = vi.fn();
    const reorder = reorderInteraction();
    render(
      <LessonNode
        lesson={lesson}
        status="available"
        authoring
        reorder={reorder}
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Locked lesson' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    expect(button).toHaveAttribute('aria-roledescription', 'sortable lesson');
    fireEvent.keyDown(button, { key: 'ArrowDown', altKey: true });
    expect(reorder.onKeyDown).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
