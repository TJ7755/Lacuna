import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/types';
import { ReviewHeatmap } from './ReviewHeatmap';

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
  it('exposes review cells as keyboard-focusable controls with descriptive tooltip content', () => {
    render(<ReviewHeatmap cards={[makeCard()]} />);

    const cell = screen.getByRole('button', { name: /1 review on/ });
    expect(cell).toHaveAttribute('data-review-heatmap-cell');
    expect(cell).toHaveAttribute('aria-describedby');
    expect(document.getElementById(cell.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      /1 review on/,
    );
  });
});
