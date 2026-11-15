import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePageShortcuts } from './usePageShortcuts';

function Host({ onStudy }: { onStudy: () => void }) {
  usePageShortcuts({ s: onStudy });
  return <input aria-label="field" />;
}

describe('usePageShortcuts', () => {
  it('fires on a plain key', () => {
    const onStudy = vi.fn();
    render(<Host onStudy={onStudy} />);
    fireEvent.keyDown(window, { key: 'S' });
    expect(onStudy).toHaveBeenCalledTimes(1);
  });

  it('ignores typing, modifiers and unbound keys', () => {
    const onStudy = vi.fn();
    const { getByLabelText } = render(<Host onStudy={onStudy} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 's' });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'x' });
    expect(onStudy).not.toHaveBeenCalled();
  });

  it('leaves radio-group keys with their owning control', () => {
    const navigate = vi.fn();
    const choose = vi.fn();
    function Choices() {
      usePageShortcuts({ arrowdown: navigate });
      return (
        <div role="radiogroup" aria-label="Choice">
          <button type="button" role="radio" aria-checked="true" onKeyDown={choose}>
            Reveal
          </button>
        </div>
      );
    }
    const { getByRole } = render(<Choices />);
    fireEvent.keyDown(getByRole('radio'), { key: 'ArrowDown' });
    expect(navigate).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledOnce();
  });

  it('ignores keys while a modal dialog is open', () => {
    const onStudy = vi.fn();
    render(<Host onStudy={onStudy} />);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: 's' });
    dialog.remove();
    expect(onStudy).not.toHaveBeenCalled();
  });
});
