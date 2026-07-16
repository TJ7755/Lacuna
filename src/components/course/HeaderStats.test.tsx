import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderStats } from './HeaderStats';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

describe('HeaderStats', () => {
  it('shows final pill values immediately when motion is disabled', () => {
    render(
      <HeaderStats
        dueCount={7}
        masteryPct={68}
        daysToExam={4}
        totalCards={20}
        unseenCount={3}
        lessonProgress={{ reached: 2, total: 5 }}
      />,
    );

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });
});
