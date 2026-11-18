import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { domAnimation, LazyMotion } from 'motion/react';
import type { Note } from '@lacuna/core/db/types';
import { LessonNotesCard } from './LessonNotesCard';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Exercise Motion's JS fallback: Happy DOM rejects cancelled native animations.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

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
  it('retires note actions while the add form replaces them and restores them on cancellation', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <LessonNotesCard lessonId="l1" notes={[note('n1', 'Why')]} editable />
      </LazyMotion>,
    );
    const add = screen.getByRole('button', { name: 'Add note' });
    fireEvent.click(add);
    expect(add).toBeInTheDocument();
    expect(add.closest('[inert]')).not.toBeNull();
    expect(add.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add note' })).toBe(add);
    expect(add.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
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
