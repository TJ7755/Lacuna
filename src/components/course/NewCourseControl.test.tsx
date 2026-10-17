import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NewCourseControl } from './NewCourseControl';
import { domAnimation, LazyMotion } from 'motion/react';

const motionPreference = vi.hoisted(() => ({ multiplier: 0 }));
beforeEach(() => {
  motionPreference.multiplier = 0;
});
// Retain real exits using Motion's JS engine; Happy DOM rejects cancelled native animations.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => motionPreference.multiplier,
}));

function Creation() {
  const [open, setOpen] = useState(false);
  return <NewCourseControl open={open} onOpenChange={setOpen} />;
}

describe('NewCourseControl', () => {
  it('reveals a final-size surface instead of animating its layout', () => {
    render(<Creation />);
    const trigger = screen.getByRole('button', { name: 'New course' });
    fireEvent.click(trigger);
    const surface = trigger.parentElement!;
    expect(surface).toHaveAttribute('data-morph-surface');
    expect(surface.style.width).toBe(`${Math.min(448, window.innerWidth - 36)}px`);
    expect(surface.style.clipPath).toBe('none');
    expect(surface.style.borderRadius).toBe('24px');
    fireEvent.click(trigger);
    expect(surface.style.clipPath).not.toBe('none');
  });
  it('refocuses the retained course name when reopened during its exit', async () => {
    motionPreference.multiplier = 1;
    render(
      <LazyMotion features={domAnimation}>
        <Creation />
      </LazyMotion>,
    );
    const trigger = screen.getByRole('button', { name: 'New course' });
    fireEvent.click(trigger);
    const name = screen.getByRole('textbox', { name: 'Course name' });
    fireEvent.click(trigger);
    expect(name).toBeInTheDocument();
    expect(name.closest('[inert]')).not.toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('textbox', { name: 'Course name' })).toBe(name);
    expect(name).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  });
  it('expands in place and returns focus after Escape or Cancel', () => {
    const { container } = render(<Creation />);
    const trigger = screen.getByRole('button', { name: 'New course' });
    expect(trigger).toHaveAttribute('data-press');
    expect(trigger.parentElement).toHaveClass(
      'bg-surface-raised',
      'ring-inset',
      'ring-line-strong',
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(container).toContainElement(screen.getByRole('form', { name: 'New course' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Course name' });
    expect(name).toHaveFocus();
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
