import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { domAnimation, LazyMotion } from 'motion/react';
import { SettingsModal } from './SettingsModal';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Keep real Motion exits while avoiding Happy DOM's cancelled native-animation promises.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <LazyMotion features={domAnimation}>
      <button onClick={() => setOpen(true)}>Open restore</button>
      <SettingsModal open={open} labelledBy="restore-title" onClose={() => setOpen(false)}>
        <h2 id="restore-title">Restore backup</h2>
        <input aria-label="Backup name" />
        <button onClick={() => setOpen(false)}>Close restore</button>
      </SettingsModal>
    </LazyMotion>
  );
}

describe('SettingsModal presence', () => {
  it('disables the exiting modal and trap immediately, then refocuses its revived form', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open restore' });
    trigger.focus();
    fireEvent.click(trigger);
    const field = screen.getByRole('textbox', { name: 'Backup name' });
    expect(field).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close restore' }));
    expect(field).toBeInTheDocument();
    expect(field.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Restore backup' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(window, tab);
    expect(tab.defaultPrevented).toBe(false);

    fireEvent.click(trigger);
    expect(screen.getByRole('textbox', { name: 'Backup name' })).toBe(field);
    expect(field.closest('[inert]')).toBeNull();
    expect(field).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  });
});
