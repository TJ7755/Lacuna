import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LessonNoteEditor } from './LessonNoteEditor';

function setup() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<LessonNoteEditor onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

describe('LessonNoteEditor keyboard', () => {
  it('opens on the title and saves with Ctrl+Enter from the body', () => {
    const { onSave } = setup();
    const title = screen.getByPlaceholderText('Note title');
    expect(title).toHaveFocus();
    fireEvent.change(title, { target: { value: 'Cells' } });
    fireEvent.keyDown(screen.getByLabelText('Content'), { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith({ name: 'Cells', content: '' });
  });

  it('Tab from the body lands on the save button', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Note title'), { target: { value: 'Cells' } });
    fireEvent.keyDown(screen.getByLabelText('Content'), { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Add note' })).toHaveFocus();
  });

  it('Escape cancels while pristine but not after typing', () => {
    const { onCancel } = setup();
    const title = screen.getByPlaceholderText('Note title');
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.input(title, { target: { value: 'x' } });
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
