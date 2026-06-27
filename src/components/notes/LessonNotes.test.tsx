import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonNotes } from './LessonNotes';
import type { Note } from '../../db/types';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

vi.mock('motion/react', () => ({
  m: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => (
    <div data-testid="markdown-view">{source}</div>
  ),
}));

vi.mock('../ui/icons', () => ({
  ChevronDownIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="chevron-icon" {...props} />
  ),
}));

const makeNote = (overrides: Partial<Note>): Note => ({
  id: 'note-1',
  lessonId: 'lesson-1',
  name: 'Default note',
  content: 'Default content',
  orderIndex: 0,
  createdAt: Date.now(),
  ...overrides,
});

describe('LessonNotes', () => {
  it('renders null when given an empty notes array', () => {
    const { container } = render(<LessonNotes notes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders note names for both notes', () => {
    const notes: Note[] = [
      makeNote({ id: 'a', name: 'First note', orderIndex: 0 }),
      makeNote({ id: 'b', name: 'Second note', orderIndex: 1 }),
    ];
    render(<LessonNotes notes={notes} />);
    expect(screen.getByText('First note')).toBeInTheDocument();
    expect(screen.getByText('Second note')).toBeInTheDocument();
  });

  it('respects orderIndex — lower index appears first', () => {
    // Deliberately pass notes in reverse order to verify sorting.
    const notes: Note[] = [
      makeNote({ id: 'b', name: 'Second note', orderIndex: 10 }),
      makeNote({ id: 'a', name: 'First note', orderIndex: 1 }),
    ];
    render(<LessonNotes notes={notes} />);
    const buttons = screen.getAllByRole('button');
    // The first button should belong to the note with the lower orderIndex.
    expect(buttons[0]).toHaveTextContent('First note');
    expect(buttons[1]).toHaveTextContent('Second note');
  });

  it('renders the first note expanded and shows its content', () => {
    const notes: Note[] = [
      makeNote({ id: 'a', name: 'Alpha', content: 'Alpha body', orderIndex: 0 }),
      makeNote({ id: 'b', name: 'Beta', content: 'Beta body', orderIndex: 1 }),
    ];
    render(<LessonNotes notes={notes} />);
    // The first note starts open — its MarkdownView should be in the DOM.
    const views = screen.getAllByTestId('markdown-view');
    expect(views).toHaveLength(1);
    expect(views[0]).toHaveTextContent('Alpha body');
  });

  it('toggles a note open on click', () => {
    const notes: Note[] = [
      makeNote({ id: 'a', name: 'Alpha', content: 'Alpha body', orderIndex: 0 }),
      makeNote({ id: 'b', name: 'Beta', content: 'Beta body', orderIndex: 1 }),
    ];
    render(<LessonNotes notes={notes} />);

    // Click the second note to open it.
    fireEvent.click(screen.getByText('Beta'));
    const views = screen.getAllByTestId('markdown-view');
    const contents = views.map((v) => v.textContent);
    expect(contents).toContain('Alpha body');
    expect(contents).toContain('Beta body');
  });
});
