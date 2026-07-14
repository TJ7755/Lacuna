import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, NoteAnnotation } from '../../db/types';
import { AnnotatedNoteContent } from './AnnotatedNoteContent';

const createAnnotation = vi.fn();
const updateAnnotation = vi.fn();
const deleteAnnotation = vi.fn();
let liveAnnotations: NoteAnnotation[] = [];

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => liveAnnotations,
}));

vi.mock('../../db/repository', () => ({
  createNoteAnnotation: (...args: unknown[]) => createAnnotation(...args),
  updateNoteAnnotation: (...args: unknown[]) => updateAnnotation(...args),
  deleteNoteAnnotation: (...args: unknown[]) => deleteAnnotation(...args),
  listNoteAnnotations: vi.fn(),
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => (
    <div className="prose-lacuna" tabIndex={-1}>
      <p>{source}</p>
    </div>
  ),
}));

vi.mock('../ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const note: Note = {
  id: 'note-1',
  lessonId: 'lesson-1',
  name: 'Cell structure',
  content: 'Alpha beta gamma',
  orderIndex: 0,
  createdAt: 1,
};

function selectText(node: Text, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('AnnotatedNoteContent', () => {
  beforeEach(() => {
    liveAnnotations = [];
    createAnnotation.mockReset().mockResolvedValue(undefined);
    updateAnnotation.mockReset().mockResolvedValue(undefined);
    deleteAnnotation.mockReset().mockResolvedValue(undefined);
  });

  it('creates a highlight with an optional annotation from a safe selection', async () => {
    const { container } = render(<AnnotatedNoteContent note={note} />);
    const paragraph = container.querySelector('.prose-lacuna p')!;
    selectText(paragraph.firstChild as Text, 6, 10);
    fireEvent.mouseUp(paragraph);

    expect(screen.getByText('beta')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Annotation/), { target: { value: 'Key term' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save highlight' }));

    await waitFor(() => {
      expect(createAnnotation).toHaveBeenCalledWith('note-1', 6, 10, 'beta', 'Key term');
    });
  });

  it('surfaces detached anchors and provides edit and confirmed-delete controls', async () => {
    liveAnnotations = [
      {
        id: 'annotation-1',
        noteId: note.id,
        startOffset: 6,
        endOffset: 10,
        selectedText: 'zeta',
        body: 'Old text',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    render(<AnnotatedNoteContent note={note} />);

    expect(screen.getByText('Detached from edited note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit annotation for zeta' }));
    fireEvent.change(screen.getByLabelText('Annotation text'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateAnnotation).toHaveBeenCalledWith('annotation-1', { body: 'Updated' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation for zeta' }));
    expect(screen.getByText('Delete this highlight?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledWith('annotation-1'));
  });
});
