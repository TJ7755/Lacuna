import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodayQueue, queueState } from './TodayQueue';

const navigate = vi.hoisted(() => vi.fn());
const prefetch = vi.hoisted(() => vi.fn());
vi.mock('../../routes/prefetch', () => ({ prefetchRoute: prefetch }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

describe('TodayQueue navigation', () => {
  it('offers exam practice without claiming future cards are due or showing due minutes', () => {
    expect(
      queueState({
        cardCount: 2,
        eligible: 0,
        reviewedTodayCount: 0,
        examPracticeEligible: 1,
        unreviewed: 0,
        completedLessonCount: 1,
        lessonCount: 1,
      }),
    ).toBe('study');
    render(
      <TodayQueue
        rows={[
          {
            id: 'biology',
            name: 'Biology',
            status: 'ahead',
            state: 'study',
            due: 0,
            minutes: 0,
            href: '/course/biology',
            hasPendingUpdate: false,
          },
        ]}
        multiplier={0}
        onStudy={vi.fn()}
        onMenu={vi.fn()}
      />,
    );
    expect(screen.getByText('Practice available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Study Biology' })).toBeInTheDocument();
    expect(screen.queryByText('Cards due:')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ min/)).not.toBeInTheDocument();
  });
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
