import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/types';
import { clampTooltipLeft, ReviewHeatmap } from './ReviewHeatmap';

const today = new Date();
today.setHours(12, 0, 0, 0);
const reviewDay = new Date(today);
reviewDay.setDate(reviewDay.getDate() - 1);
const reviewTimestamp = reviewDay.getTime();

function makeCard(): Card {
  return {
    id: 'card-1',
    conceptId: 'concept-1',
    type: 'front_back',
    front: 'Front',
    back: 'Back',
    stability: 1,
    difficulty: 5,
    lastReviewed: reviewTimestamp,
    reps: 1,
    lapses: 0,
    state: 2,
    schedulingUnitId: 'course-1',
    due: reviewTimestamp,
    scheduledDays: 1,
    learningSteps: 0,
    history: [
      {
        timestamp: reviewTimestamp,
        grade: 3,
        responseTimeSec: 1,
        distracted: false,
      },
    ],
  } as Card;
}

describe('ReviewHeatmap', () => {
  it('clamps tooltip edges using its measured width', () => {
    expect(clampTooltipLeft({ left: 0, width: 12 }, 120, 800)).toBe(8);
    expect(clampTooltipLeft({ left: 794, width: 12 }, 120, 800)).toBe(672);
  });

  it('uses one roving tab stop and moves the focused detail with arrow keys', () => {
    render(<ReviewHeatmap cards={[makeCard()]} />);

    const cells = screen.getAllByRole('gridcell');
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    const cell = cells.find((candidate) => candidate.getAttribute('aria-label')?.startsWith('1 review'));
    expect(cell).toBeDefined();
    if (!cell) return;
    expect(cell).toHaveAttribute('data-review-heatmap-cell');
    expect(cell).toHaveAttribute('aria-label', expect.stringMatching(/1 review on/));
    expect(cell).not.toHaveAttribute('aria-describedby');

    const initialActive = cells.findIndex((candidate) => candidate.tabIndex === 0);
    fireEvent.focus(cells[initialActive]);
    expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent(
      cells[initialActive].getAttribute('aria-label') ?? '',
    );
    fireEvent.keyDown(cells[initialActive], { key: 'ArrowRight' });
    const nextActive = screen.getAllByRole('gridcell').find((candidate) => candidate.tabIndex === 0);
    expect(nextActive).not.toBe(cells[initialActive]);
    expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent(
      nextActive?.getAttribute('aria-label') ?? '',
    );
  });

  it('renders the presentational tooltip outside the horizontally scrolling grid', () => {
    const { container } = render(<ReviewHeatmap cards={[makeCard()]} />);
    fireEvent.focus(screen.getAllByRole('gridcell')[0]);
    const scrollport = container.querySelector('.overflow-x-auto');
    const tooltip = document.body.querySelector('[role="tooltip"]');
    expect(scrollport).toBeInTheDocument();
    expect(tooltip).toBeInTheDocument();
    expect(scrollport).not.toContainElement(tooltip as HTMLElement | null);
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
    expect(tooltip).toHaveStyle({ position: 'fixed' });
  });
});
