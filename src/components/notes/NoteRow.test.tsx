import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../db/types';
import { NoteRow, noteRowTiming } from './NoteRow';

vi.mock('./LessonNoteEditor', () => ({
  LessonNoteEditor: ({ onCancel }: { onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>
      Cancel edit
    </button>
  ),
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => <p>{source}</p>,
}));

const note: Note = {
  id: 'note-1',
  lessonId: 'lesson-1',
  name: 'Cell structure',
  content: 'A cell has a membrane.',
  orderIndex: 0,
  createdAt: 1,
  updatedAt: 1,
};

function baseProps() {
  return {
    note,
    isOpen: true,
    isFirst: true,
    isLast: true,
    confirmingDelete: false,
    noteBusy: false,
    motionMultiplier: 0,
    onToggle: vi.fn(),
    onEditSave: vi.fn(),
    onDeleteRequest: vi.fn(),
    onDeleteConfirm: vi.fn(),
    onDeleteCancel: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
  };
}

describe('NoteRow', () => {
  it('scales its height-aware transition and disables it for reduced motion', () => {
    expect(noteRowTiming(1.4).duration).toBeCloseTo(0.252);
    expect(noteRowTiming(0).duration).toBe(0);
  });

  it('restores focus to Edit after cancelling the editor swap', async () => {
    function Harness() {
      const [editing, setEditing] = useState(false);
      return (
        <NoteRow
          {...baseProps()}
          isEditing={editing}
          onEdit={() => setEditing(true)}
          onEditCancel={() => setEditing(false)}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTitle('Edit note'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    await waitFor(() => expect(screen.getByTitle('Edit note')).toHaveFocus());
  });
});
