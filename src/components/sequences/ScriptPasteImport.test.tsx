import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScriptPasteImport } from './ScriptPasteImport';

describe('ScriptPasteImport', () => {
  it('splits pasted text into a speaker-tagged preview, editable before confirming', () => {
    const onImport = vi.fn();
    render(<ScriptPasteImport onImport={onImport} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/ALICE: Hello there/), {
      target: { value: 'ALICE: Hello there.\nBOB: General Kenobi.' },
    });
    fireEvent.click(screen.getByText('Split into lines'));

    expect(screen.getByDisplayValue('ALICE')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello there.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('BOB')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Use these 2 lines/));
    expect(onImport).toHaveBeenCalledWith([
      { id: expect.any(String), speaker: 'ALICE', value: 'Hello there.' },
      { id: expect.any(String), speaker: 'BOB', value: 'General Kenobi.' },
    ]);
  });

  it('allows correcting a misattributed speaker before importing', () => {
    const onImport = vi.fn();
    render(<ScriptPasteImport onImport={onImport} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/ALICE: Hello there/), {
      target: { value: 'ALIC: Hello there.' },
    });
    fireEvent.click(screen.getByText('Split into lines'));

    fireEvent.change(screen.getByDisplayValue('ALIC'), { target: { value: 'ALICE' } });
    fireEvent.click(screen.getByText(/Use these 1 line/));

    expect(onImport).toHaveBeenCalledWith([
      { id: expect.any(String), speaker: 'ALICE', value: 'Hello there.' },
    ]);
  });

  it('lets the user go back and re-split after previewing', () => {
    const onImport = vi.fn();
    render(<ScriptPasteImport onImport={onImport} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/ALICE: Hello there/), {
      target: { value: 'ALICE: Hello there.' },
    });
    fireEvent.click(screen.getByText('Split into lines'));
    expect(screen.getByDisplayValue('ALICE')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByPlaceholderText(/ALICE: Hello there/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('calls onCancel when the close button is clicked', () => {
    const onCancel = vi.fn();
    render(<ScriptPasteImport onImport={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText('Close script paste'));
    expect(onCancel).toHaveBeenCalled();
  });
});
