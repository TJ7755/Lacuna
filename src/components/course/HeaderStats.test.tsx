import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderStats } from './HeaderStats';
import {
  DEFAULT_STAT_PILLS,
  writeCourseHeaderSettings,
} from '../../state/courseHeaderSettings';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

beforeEach(() => {
  // The pill preference is stored per device; one test's choice must not leak.
  localStorage.clear();
});

describe('HeaderStats', () => {
  it('shows final pill values immediately when motion is disabled', () => {
    // Every pill turned on, so this still covers all five values rather than only the
    // two shown by default.
    writeCourseHeaderSettings({
      statPills: DEFAULT_STAT_PILLS.map((pill) => ({ ...pill, visible: true })),
    });
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

  it('shows only cards due and mastery until the reader adds the others', () => {
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
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.queryByText('2 of 5')).not.toBeInTheDocument();
    expect(screen.queryByText('days to go')).not.toBeInTheDocument();
    expect(screen.queryByText('unmapped')).not.toBeInTheDocument();
  });
});
