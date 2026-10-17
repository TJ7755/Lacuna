import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard, createLesson } from '../../db/repository';
import { linkCardToLesson } from '../../db/lessonRepository';
import { createNote } from '../../db/noteRepository';
import { db } from '../../db/schema';
import type { Lesson } from '../../db/types';
import { ToastProvider } from '../ui/Toast';
import type { MenuHandle } from '../ui/Menu';
import {
  LessonActionsMenu,
  lessonContextMenu,
  lessonDeletionConsequence,
} from './LessonActionsMenu';

function Harness({ lesson, onMove = vi.fn() }: { lesson: Lesson; onMove?: () => void }) {
  const menu = useRef<MenuHandle>(null);
  return (
    <ToastProvider>
      <div data-testid="row" {...lessonContextMenu(() => menu.current)}>
        <button type="button">{lesson.name}</button>
        <input aria-label="Draft" />
        <LessonActionsMenu lesson={lesson} position={0} count={2} onMove={onMove} handle={menu} />
      </div>
    </ToastProvider>
  );
}

async function seed() {
  const course = await createCourse('Biology');
  const lesson = await createLesson(course.id, 'Cells');
  await createNote(lesson.id, 'Organelles');
  await createNote(lesson.id, 'Membranes');
  const card = await createCourseCard(course.id, 'front_back', 'Nucleus?', 'Control centre');
  await linkCardToLesson(lesson.id, card.id);
  return lesson;
}

describe('LessonActionsMenu', () => {
  afterEach(() => cleanup());
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('describes deletion in terms of notes removed and cards kept', () => {
    expect(lessonDeletionConsequence(2, 1)).toBe(
      'Its 2 notes will be deleted. Its 1 card stays in the course without a lesson.',
    );
    expect(lessonDeletionConsequence(1, 3)).toBe(
      'Its 1 note will be deleted. Its 3 cards stay in the course without a lesson.',
    );
    expect(lessonDeletionConsequence(0, 0)).toBe('It has no notes. It has no cards.');
  });

  it('opens from right-click and Shift+F10 but leaves text fields their own menu', () => {
    const lesson = { id: 'l', courseId: 'c', name: 'Cells', orderIndex: 0 } as Lesson;
    render(<Harness lesson={lesson} />);
    const input = screen.getByRole('textbox', { name: 'Draft' });
    expect(fireEvent.contextMenu(input)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Cells' }))).toBe(false);
    expect(screen.getByRole('menu', { name: 'Lesson actions: Cells' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cells' }), {
      key: 'F10',
      shiftKey: true,
    });
    expect(screen.getByRole('menu', { name: 'Lesson actions: Cells' })).toBeInTheDocument();
  });

  it('moves the lesson through the same callback as the path', () => {
    const onMove = vi.fn();
    const lesson = { id: 'l', courseId: 'c', name: 'Cells', orderIndex: 0 } as Lesson;
    render(<Harness lesson={lesson} onMove={onMove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lesson actions: Cells' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(onMove).toHaveBeenCalledWith(1);
  });

  it('confirms with the real consequences, returns focus on cancel, and undoes deletion', async () => {
    const lesson = await seed();
    render(<Harness lesson={lesson} />);
    const trigger = screen.getByRole('button', { name: 'Lesson actions: Cells' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete lesson' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Cells?' });
    expect(
      await screen.findByText(
        'Its 2 notes will be deleted. Its 1 card stays in the course without a lesson.',
      ),
    ).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(await db.lessons.get(lesson.id)).toBeDefined();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete lesson' }));
    await screen.findByText(/Its 2 notes/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete lesson' }));
    await screen.findByText('Cells deleted.');
    expect(await db.lessons.get(lesson.id)).toBeUndefined();
    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(0);
    expect(await db.cards.count()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.lessons.get(lesson.id)).toBeDefined());
    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(2);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);
  });
});
