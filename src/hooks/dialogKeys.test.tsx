import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { dialogKeyDown } from './dialogKeys';

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
