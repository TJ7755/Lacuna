import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScopedFindShortcut } from './useScopedFindShortcut';

function Harness({ enabled = true }: { enabled?: boolean }) {
  const open = vi.fn();
  useScopedFindShortcut(enabled ? open : undefined);
  return (
    <>
      <button onClick={open}>Open</button>
      <input aria-label="Editor" />
      <textarea aria-label="Notes" />
      <input data-scoped-find aria-label="Find" />
    </>
  );
}

describe('useScopedFindShortcut', () => {
  it('claims either platform shortcut only in an enabled deck view', () => {
    const { unmount } = render(<Harness />);
    for (const modifier of ['ctrlKey', 'metaKey']) {
      expect(fireEvent.keyDown(window, { key: 'f', [modifier]: true })).toBe(false);
    }
    expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true, isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true, keyCode: 229 })).toBe(true);
    unmount();
    render(<Harness enabled={false} />);
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true })).toBe(true);
  });

  it('leaves editors and modal dialogs in charge, but permits the Find field', () => {
    render(<Harness />);
    for (const label of ['Editor', 'Notes']) {
      expect(fireEvent.keyDown(screen.getByLabelText(label), { key: 'f', ctrlKey: true })).toBe(
        true,
      );
    }
    expect(fireEvent.keyDown(screen.getByLabelText('Find'), { key: 'f', ctrlKey: true })).toBe(
      false,
    );
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    expect(fireEvent.keyDown(window, { key: 'f', metaKey: true })).toBe(true);
    dialog.remove();
  });
});
