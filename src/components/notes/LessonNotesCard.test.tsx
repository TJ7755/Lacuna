import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as MotionReact from 'motion/react';
import type { Note } from '../../db/types';
import { LessonNotesCard } from './LessonNotesCard';

const presence = vi.hoisted(() => ({ current: true }));
vi.mock('motion/react', async () => ({
  ...(await vi.importActual<typeof MotionReact>('motion/react')),
  useIsPresent: () => presence.current,
}));

vi.mock('./AnnotatedNoteContent', () => ({
  AnnotatedNoteContent: ({ note }: { note: Note }) => <p>{note.content}</p>,
}));

const note = (id: string, name: string) =>
  ({
    id,
    lessonId: 'l1',
    name,
    content: `${name} body`,
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
  }) as Note;

describe('LessonNotesCard', () => {
  it('takes departing note actions out of the keyboard and accessibility tree', () => {
    presence.current = false;
    render(<LessonNotesCard lessonId="l1" notes={[note('n1', 'Why')]} editable />);
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
    expect(screen.getByText('Add note').closest('[inert]')).not.toBeNull();
    presence.current = true;
  });

  it('names an empty notes card beside its Add note action', () => {
    render(<LessonNotesCard lessonId="l1" notes={[]} editable />);
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('leaves no empty bar above a single note in View mode', () => {
    const { container } = render(
      <LessonNotesCard lessonId="l1" notes={[note('n1', 'Why')]} editable={false} />,
    );
    expect(container.querySelector('[data-note-bar]')).toBeNull();
    expect(screen.getByText('Why body')).toBeInTheDocument();
  });

  it('keeps the bar for editing controls and for switching between notes', () => {
    const { container, rerender } = render(
      <LessonNotesCard lessonId="l1" notes={[note('n1', 'Why')]} editable />,
    );
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
    rerender(
      <LessonNotesCard
        lessonId="l1"
        notes={[note('n1', 'Why'), note('n2', 'How')]}
        editable={false}
      />,
    );
    expect(container.querySelector('[data-note-bar]')).not.toBeNull();
    expect(screen.getByRole('tablist', { name: 'Notes' })).toBeInTheDocument();
  });
});
