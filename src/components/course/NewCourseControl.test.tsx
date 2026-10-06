import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NewCourseControl } from './NewCourseControl';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => 0,
}));

function Creation() {
  const [open, setOpen] = useState(false);
  return <NewCourseControl open={open} onOpenChange={setOpen} />;
}

describe('NewCourseControl', () => {
  it('expands in place and returns focus after Escape or Cancel', () => {
    const { container } = render(<Creation />);
    const trigger = screen.getByRole('button', { name: 'New course' });
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
