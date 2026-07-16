import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../db/types';
import type { CourseSummary } from '../../state/useCourseData';
import type { CourseCardMetric } from '../../state/courseCardMetric';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import { CourseCard } from './CourseCard';

let metric: CourseCardMetric = 'curriculum';

vi.mock('../../state/courseCardMetric', () => ({
  useCourseCardMetric: () => [metric, vi.fn()],
}));

vi.mock('../../state/courseCardDetail', () => ({
  useCourseCardDetail: () => [{ nextDue: false, breakdown: false, activity: false }, vi.fn()],
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

const course: Course = {
  id: 'course',
  name: 'Biology',
  description: '',
  createdAt: 0,
  examDate: Date.now() + 7 * 86_400_000,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const summary: CourseSummary = {
  lessonCount: 3,
  cardCount: 11,
  mastery: 0.89,
  unreviewed: 4,
  eligible: 2,
  completedLessonCount: 1,
  reviewedCardCount: 7,
  reviewedTodayCount: 3,
};

describe('CourseCard metrics', () => {
  beforeEach(() => {
    metric = 'curriculum';
  });

  function cardButton() {
    render(<CourseCard course={course} summary={summary} cards={[]} onClick={vi.fn()} />);
    return within(screen.getByRole('button', { name: /Biology/ }));
  }

  it('renders completed lessons as segmented curriculum progress by default', () => {
    const card = cardButton();

    expect(card.getByText('1 of 3 complete')).toBeInTheDocument();
    expect(card.getByRole('progressbar', { name: 'Curriculum progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    expect(card.getByText('2 ready now')).toBeInTheDocument();
  });

  it('renders reviewed-card coverage', () => {
    metric = 'coverage';
    const card = cardButton();

    expect(card.getByText('7 of 11 reviewed')).toBeInTheDocument();
    expect(card.getByRole('progressbar', { name: 'Card coverage' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    );
  });

  it("renders today's reviewed work against the remaining ready cards", () => {
    metric = 'today';
    const card = cardButton();

    expect(card.getByText('3 reviewed today')).toBeInTheDocument();
    expect(card.getByRole('progressbar', { name: "Today's workload" })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
  });

  it('opens its action menu at the pointer without activating the card', () => {
    const onClick = vi.fn();
    const onArchiveMenu = vi.fn();
    render(
      <CourseCard
        course={course}
        summary={summary}
        cards={[]}
        onClick={onClick}
        onArchiveMenu={onArchiveMenu}
      />,
    );
    const button = screen.getByRole('button', { name: /Biology/ });

    fireEvent.contextMenu(button, { clientX: 90, clientY: 120 });

    expect(onArchiveMenu).toHaveBeenCalledWith({ x: 90, y: 120 }, button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens its action menu with the keyboard context-menu shortcut', () => {
    const onArchiveMenu = vi.fn();
    render(
      <CourseCard
        course={course}
        summary={summary}
        cards={[]}
        onClick={vi.fn()}
        onArchiveMenu={onArchiveMenu}
      />,
    );
    const button = screen.getByRole('button', { name: /Biology/ });

    fireEvent.keyDown(button, { key: 'ContextMenu' });
    expect(onArchiveMenu).toHaveBeenCalledWith({ x: 12, y: 12 }, button);
  });
});
