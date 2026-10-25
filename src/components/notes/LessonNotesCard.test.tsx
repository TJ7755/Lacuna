import { fireEvent, render, screen } from '@testing-library/react';
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

  it('offers Add note without an empty reading panel', () => {
    render(<LessonNotesCard lessonId="l1" notes={[]} editable />);
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('keeps an open first-note draft when another note arrives', () => {
    const { rerender } = render(<LessonNotesCard lessonId="l1" notes={[]} editable />);
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    const content = screen.getByRole('textbox', { name: 'Content' });
    fireEvent.change(title, { target: { value: 'My unfinished explanation' } });
    fireEvent.change(content, { target: { value: 'This draft must survive a live update.' } });
    title.focus();
    rerender(<LessonNotesCard lessonId="l1" notes={[note('arriving', 'Another note')]} editable />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('My unfinished explanation');
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(
      'This draft must survive a live update.',
    );
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
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
