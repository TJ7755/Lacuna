import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StudyExpansion } from './StudyExpansion';
import { Menu } from '../ui/Menu';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Exercise Motion's real exit retention without Happy DOM's native-animation stub.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

function StudyActions() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <LazyMotion features={domAnimation}>
      <button onClick={(event) => setAnchor(event.currentTarget)}>Study</button>
      <Menu label="Other ways" items={[{ label: 'Practise', onSelect: vi.fn() }]}>
        Other ways
      </Menu>
      <AnimatePresence>
        {anchor && (
          <StudyExpansion anchor={anchor} onClose={() => setAnchor(null)}>
            <h2 tabIndex={-1}>Session plan</h2>
          </StudyExpansion>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

describe('StudyExpansion layering', () => {
  it('lowers the retained surface as soon as Other ways opens and raises it on reopening', () => {
    render(<StudyActions />);
    const study = screen.getByRole('button', { name: /^Study$/ });
    const otherWays = screen.getByRole('button', { name: 'Other ways' });
    fireEvent.click(study);
    const surface = screen.getByRole('region', { name: 'Session preview' });

    fireEvent.pointerDown(otherWays);
    fireEvent.click(otherWays);

    expect(surface).toBeInTheDocument();
    expect(surface).toHaveAttribute('inert');
    expect(otherWays).toHaveAttribute('aria-expanded', 'true');
    expect(otherWays.closest('.relative')).toHaveClass('z-30');
    expect(surface).toHaveStyle({ zIndex: '20' });

    fireEvent.pointerDown(study);
    fireEvent.click(study);

    expect(otherWays).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Session preview' })).toBe(surface);
    expect(surface).not.toHaveAttribute('inert');
    expect(surface).toHaveStyle({ zIndex: '50' });
  });
});

describe('StudyExpansion dismissal focus', () => {
  it('does not leave a focus highlight on Study after pointer dismissal', () => {
    render(<StudyActions />);
    const study = screen.getByRole('button', { name: /^Study$/ });
    fireEvent.click(study);
    const close = screen.getByRole('button', { name: 'Close session preview' });
    fireEvent.pointerDown(close);
    fireEvent.click(close);
    expect(study).not.toHaveFocus();
  });

  it('returns keyboard focus to Study after Escape', () => {
    render(<StudyActions />);
    const study = screen.getByRole('button', { name: /^Study$/ });
    fireEvent.click(study);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(study).toHaveFocus();
  });
});
