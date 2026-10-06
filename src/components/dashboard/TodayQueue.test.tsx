import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HTMLAttributes, ReactNode } from 'react';
import { TodayQueue } from './TodayQueue';

interface RowMotion {
  whileHover?: { transition?: { delay: number; duration: number } };
  animate?: { y: number; transition?: { y: { delay: number } } };
}
const motionProps = vi.hoisted(() => ({ row: {} as RowMotion }));
vi.mock('motion/react', () => ({
  m: {
    div: ({
      children,
      className,
      onFocusCapture,
      onBlurCapture,
      ...rest
    }: HTMLAttributes<HTMLDivElement> & RowMotion) => {
      motionProps.row = rest;
      return (
        <div className={className} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture}>
          {children as ReactNode}
        </div>
      );
    },
    span: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe('TodayQueue lift', () => {
  it('starts hover immediately and lifts the row when a keyboard user focuses a control', () => {
    render(
      <TodayQueue
        rows={[
          {
            id: 'biology',
            name: 'Biology',
            status: 'ahead',
            due: 0,
            minutes: 0,
            href: '/course/biology',
            hasPendingUpdate: false,
          },
        ]}
        multiplier={1}
        onStudy={vi.fn()}
        onMenu={vi.fn()}
      />,
    );
    expect(motionProps.row.whileHover?.transition?.delay).toBe(0);
    expect(motionProps.row.whileHover?.transition?.duration).toBeLessThanOrEqual(0.2);
    fireEvent.focus(screen.getByRole('link', { name: 'Biology' }));
    expect(motionProps.row.animate?.y).toBe(-2);
    expect(motionProps.row.animate?.transition?.y.delay).toBe(0);
    fireEvent.blur(screen.getByRole('link', { name: 'Biology' }), { relatedTarget: document.body });
    expect(motionProps.row.animate?.y).toBe(0);
  });
});
