import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

function Editor() {
  const [value, setValue] = useState('Original');
  return <MarkdownEditor label="Front" value={value} onChange={setValue} />;
}

function historyKey(key: string, shiftKey = false) {
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Front' }), { key, ctrlKey: true, shiftKey });
}

describe('Markdown editor undo history', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('undoes recent typing without waiting for the history debounce and keeps it for redo', () => {
    render(<Editor />);
    const field = screen.getByRole('textbox', { name: 'Front' });
    fireEvent.keyDown(field, { key: 'x' });
    fireEvent.change(field, { target: { value: 'Original extra' } });
    historyKey('z');
    expect(field).toHaveValue('Original');
    historyKey('z', true);
    expect(field).toHaveValue('Original extra');
  });

  it('records edits made without keydown, including paste and context-menu changes', () => {
    render(<Editor />);
    const field = screen.getByRole('textbox', { name: 'Front' });
    fireEvent.change(field, { target: { value: 'First paste' } });
    act(() => vi.advanceTimersByTime(801));
    fireEvent.change(field, { target: { value: 'Second paste' } });
    act(() => vi.advanceTimersByTime(801));
    historyKey('z');
    expect(field).toHaveValue('First paste');
    historyKey('z');
    expect(field).toHaveValue('Original');
  });

  it('does not redo over a fresh edit made after undo', () => {
    render(<Editor />);
    const field = screen.getByRole('textbox', { name: 'Front' });
    fireEvent.keyDown(field, { key: 'x' });
    fireEvent.change(field, { target: { value: 'First edit' } });
    act(() => vi.advanceTimersByTime(801));
    historyKey('z');
    fireEvent.change(field, { target: { value: 'New edit' } });
    historyKey('y');
    expect(field).toHaveValue('New edit');
    historyKey('z');
    expect(field).toHaveValue('Original');
    historyKey('y');
    expect(field).toHaveValue('New edit');
  });
});
