import { act, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '@lacuna/core/db/types';
import { LessonNotesStudyView } from './LessonNotesStudyView';

const renderContent = vi.hoisted(() => vi.fn());
vi.mock('./AnnotatedNoteContent', () => ({
  AnnotatedNoteContent: ({ note }: { note: Note }) => {
    renderContent(note.id);
    return <input aria-label={`${note.name} annotation`} defaultValue="Draft" />;
  },
}));

const notes: Note[] = ['First', 'Second', 'Third', 'Fourth'].map((name, orderIndex) => ({
  id: name,
  lessonId: 'lesson',
  name,
  content: `# ${name}`,
  orderIndex,
  createdAt: 1,
  updatedAt: 1,
}));

function setup() {
  return render(
    <LazyMotion features={domAnimation}>
      <LessonNotesStudyView notes={notes} />
    </LazyMotion>,
  );
}

describe('study note disclosures', () => {
  it('starts on a primary mouse press without toggling again on click', () => {
    setup();
    const button = screen.getByRole('button', { name: 'First' });
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button, { detail: 1 });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button, { detail: 1 });
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps touch activation on click and ignores secondary mouse presses', () => {
    setup();
    const button = screen.getByRole('button', { name: 'First' });
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 2 });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(button, { pointerType: 'touch', button: 0 });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerCancel(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(button, { pointerType: 'touch', button: 0 });
    fireEvent.click(button, { detail: 1 });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not render any note body again when another section toggles', () => {
    setup();
    renderContent.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(renderContent).not.toHaveBeenCalled();
  });

  it('retains rendered content and annotation drafts after collapse and reopen', async () => {
    setup();
    const input = screen.getByRole('textbox', { name: 'First annotation' });
    fireEvent.change(input, { target: { value: 'Unsaved highlight' } });
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 700)));
    expect(input).toBeInTheDocument();
    expect(input.closest('[inert]')).not.toBeNull();
    renderContent.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('textbox', { name: 'First annotation' })).toBe(input);
    expect(input).toHaveValue('Unsaved highlight');
    expect(renderContent).not.toHaveBeenCalled();
  });
});
