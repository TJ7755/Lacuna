import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/types';
import { TouchMenuSheet } from './TouchMenu';

function renderMenu(card: Partial<Card> = {}, focusMode = false) {
  const handlers = {
    onEdit: vi.fn(),
    onToggleFlag: vi.fn(),
    onBury: vi.fn(),
    onSuspend: vi.fn(),
    onShowShortcuts: vi.fn(),
    onToggleFocus: vi.fn(),
    onClose: vi.fn(),
  };
  render(<TouchMenuSheet current={card as Card} focusMode={focusMode} m={0} {...handlers} />);
  return handlers;
}

describe('TouchMenuSheet', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes each action to its handler', () => {
    const handlers = renderMenu();
    const actions: [string, keyof typeof handlers][] = [
      ['Edit card', 'onEdit'],
      ['Flag card', 'onToggleFlag'],
      ['Bury until tomorrow', 'onBury'],
      ['Focus mode', 'onToggleFocus'],
      ['Suspend card', 'onSuspend'],
      ['Keyboard shortcuts', 'onShowShortcuts'],
      ['Cancel', 'onClose'],
    ];
    for (const [name, handler] of actions) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(handlers[handler]).toHaveBeenCalledTimes(1);
    }
  });

  it('describes card actions without changing their accessible names', () => {
    renderMenu();
    for (const [name, description] of [
      ['Flag card', 'Find it later; its schedule is unchanged.'],
      ['Bury until tomorrow', 'Back tomorrow.'],
      ['Suspend card', 'Out of study until you resume it.'],
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(description);
    }
  });

  it('reflects flag and focus state and hides editing for derived cards', () => {
    renderMenu({ flagged: true, sequenceItemId: 'item-1' }, true);
    expect(screen.getByRole('button', { name: 'Remove flag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave focus mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit card' })).not.toBeInTheDocument();
  });

  it('closes from the drag handle with Enter or Space only', () => {
    const { onClose } = renderMenu();
    const handle = screen.getByRole('button', { name: 'Drag to close' });
    fireEvent.keyDown(handle, { key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.keyDown(handle, { key: ' ' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('dismisses on a backdrop tap but not a tap inside the sheet', () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByText('Bury until tomorrow').parentElement!.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog', { name: 'Card actions' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a long drag down and springs back from a short one', () => {
    const { onClose } = renderMenu();
    const handle = screen.getByRole('button', { name: 'Drag to close' });
    const sheet = handle.parentElement!.parentElement!;
    sheet.setPointerCapture = vi.fn();
    sheet.releasePointerCapture = vi.fn();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(sheet, { clientY: 140, pointerId: 1 });
    now.mockReturnValue(500);
    fireEvent.pointerUp(sheet, { pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(sheet, { clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(sheet, { pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheet.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('treats a quick flick as a dismissal', () => {
    const { onClose } = renderMenu();
    const handle = screen.getByRole('button', { name: 'Drag to close' });
    const sheet = handle.parentElement!.parentElement!;
    sheet.setPointerCapture = vi.fn();
    sheet.releasePointerCapture = vi.fn();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(sheet, { clientY: 130, pointerId: 1 });
    now.mockReturnValue(100);
    fireEvent.pointerUp(sheet, { pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
