import { act, render, screen } from '@testing-library/react';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../db/types';
import { ArchiveCourseDialog } from './CourseActions';

vi.mock('../../db/courseRepository', () => ({ updateCourse: vi.fn() }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

const course = { id: 'biology', name: 'Biology' } as Course;

describe('ArchiveCourseDialog exit', () => {
  it('retires the retained dialog and its focus trap immediately, then revives focus on reopening', async () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {open && <ArchiveCourseDialog course={course} onClose={vi.fn()} onArchived={vi.fn()} />}
        </AnimatePresence>
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const confirm = screen.getByRole('button', { name: 'Archive course' });
    expect(confirm).toHaveFocus();
    rerender(view(false));
    expect(confirm).toBeInTheDocument();
    expect(confirm.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Archive Biology?' })).not.toBeInTheDocument();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Archive course' })).toBe(confirm);
    expect(confirm.closest('[inert]')).toBeNull();
    expect(confirm).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
  });
});
