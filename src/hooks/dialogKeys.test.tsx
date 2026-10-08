import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { dialogKeyDown, useEditorKeys } from './dialogKeys';

function setup(enterSubmits: boolean) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  render(
    <div onKeyDown={dialogKeyDown({ onCancel, onSubmit, enterSubmits })}>
      <input type="text" aria-label="Name" />
      <textarea aria-label="Notes" />
      <button type="button">Cancel</button>
    </div>,
  );
  return { onCancel, onSubmit };
}

describe('dialogKeyDown', () => {
  it('cancels on Escape', () => {
    const { onCancel } = setup(true);
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('submits on Ctrl or Cmd+Enter from a textarea', () => {
    const { onSubmit } = setup(false);
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('leaves plain Enter in a textarea alone', () => {
    const { onSubmit } = setup(true);
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits on plain Enter in a text input only for single-line forms', () => {
    const single = setup(true);
    fireEvent.keyDown(screen.getAllByLabelText('Name')[0], { key: 'Enter' });
    expect(single.onSubmit).toHaveBeenCalledOnce();
  });

  it('does not hijack Enter on a button', () => {
    const { onSubmit } = setup(true);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

function EditorHost({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: () => void }) {
  const keys = useEditorKeys({ onCancel, onSubmit });
  return (
    <div {...keys}>
      <input type="text" aria-label="Name" />
      <textarea
        aria-label="Item"
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 'Enter') e.preventDefault();
        }}
      />
    </div>
  );
}

describe('useEditorKeys', () => {
  it('submits on Ctrl/Cmd+Enter unless a field used the key', () => {
    const onSubmit = vi.fn();
    render(<EditorHost onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByLabelText('Item'), { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('cancels on Escape only while pristine', () => {
    const onCancel = vi.fn();
    render(<EditorHost onCancel={onCancel} onSubmit={vi.fn()} />);
    const name = screen.getByLabelText('Name');
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.input(name, { target: { value: 'x' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('lets the key reach the window so shell shortcuts keep working', () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(<EditorHost onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: '?' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onWindowKey).toHaveBeenCalled();
  });
});
