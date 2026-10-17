import { act, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../db/types';
import { OtherShareWays } from './OtherShareWays';

vi.mock('../../db/assets', () => ({ referencedAssetHashes: () => [] }));
vi.mock('../../db/courseRepository', () => ({ publishCourse: vi.fn() }));
vi.mock('../../db/export', () => ({ exportCardsSimple: vi.fn() }));
vi.mock('../../db/share', () => ({
  buildCourseShareCode: vi.fn(),
  buildCourseShareCodeQR: vi.fn(),
}));
vi.mock('../import/CourseFileControls', () => ({
  CourseFileExportButton: () => <button>Export course file</button>,
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
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
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 450)));

describe('OtherShareWays exit', () => {
  it('retires outgoing alternatives immediately while switching panels', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <OtherShareWays course={course} cards={[]} />
      </LazyMotion>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }));
    await settle();
    const outgoing = screen.getByRole('button', { name: 'Create share code' });
    const qr = screen.getByRole('button', { name: 'QR code' });
    qr.focus();
    fireEvent.click(qr);
    expect(outgoing).toBeInTheDocument();
    expect(outgoing.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Create share code' })).not.toBeInTheDocument();
    expect(qr).toHaveFocus();
    await settle();
    expect(screen.getByRole('button', { name: 'Create QR code' }).closest('[inert]')).toBeNull();
  });

  it('retires the collapsing alternatives and revives them during a rapid reopen', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <OtherShareWays course={course} cards={[]} />
      </LazyMotion>,
    );
    const toggle = screen.getByRole('button', { name: 'Share code' });
    fireEvent.click(toggle);
    await settle();
    const action = screen.getByRole('button', { name: 'Create share code' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(action).toBeInTheDocument();
    expect(action.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Create share code' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Create share code' })).toBe(action);
    expect(action.closest('[inert]')).toBeNull();
    expect(toggle).toHaveFocus();
    await settle();
  });
});
