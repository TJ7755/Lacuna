import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { TodayQueue } from './TodayQueue';

interface RowMotion {
  whileHover?: { transition?: { delay: number; duration: number } };
  animate?: { y: number; transition?: { y: { delay: number } } };
}
const navigate = vi.hoisted(() => vi.fn());
const prefetch = vi.hoisted(() => vi.fn());
vi.mock('../../routes/prefetch', () => ({ prefetchRoute: prefetch }));
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
    button: ({ children, onClick, 'aria-label': label }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button onClick={onClick} aria-label={label}>{children}</button>
    ),
    span: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  },
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
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
            state: 'done',
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
    fireEvent.focus(screen.getByRole('button', { name: 'Biology' }));
    expect(motionProps.row.animate?.y).toBe(-2);
    expect(motionProps.row.animate?.transition?.y.delay).toBe(0);
    fireEvent.blur(screen.getByRole('button', { name: 'Biology' }), { relatedTarget: document.body });
    expect(motionProps.row.animate?.y).toBe(0);
  });
});

describe('TodayQueue navigation', () => {
  it('opens the course without a native link and keeps Study and menu actions independent', () => {
    navigate.mockClear();
    prefetch.mockClear();
    const onStudy = vi.fn();
    const onMenu = vi.fn();
    render(
      <TodayQueue
        rows={[
          {
            id: 'biology',
            name: 'Biology',
            status: 'ahead',
            state: 'study',
            due: 3,
            minutes: 1,
            href: '/course/biology',
            hasPendingUpdate: false,
          },
        ]}
        multiplier={0}
        onStudy={onStudy}
        onMenu={onMenu}
      />,
    );
    const title = screen.getByRole('button', { name: 'Biology' });
    expect(title).toHaveAttribute('type', 'button');
    expect(title).not.toHaveAttribute('href');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.pointerEnter(title);
    fireEvent.focus(title);
    expect(prefetch).toHaveBeenCalledWith('/course/biology');
    fireEvent.click(title);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/course/biology');
    expect(onStudy).not.toHaveBeenCalled();
    expect(onMenu).not.toHaveBeenCalled();
    navigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Study Biology' }));
    expect(onStudy).toHaveBeenCalledExactlyOnceWith('biology');
    expect(onMenu).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'More for Biology' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
