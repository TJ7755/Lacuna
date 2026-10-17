import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchedulingFieldsSection } from './SchedulingFieldsSection';

function renderSection() {
  render(
    <SchedulingFieldsSection
      newCardsPerDay="20"
      onNewCardsPerDayChange={vi.fn()}
      onNewCardsPerDayBlur={vi.fn()}
      maxReviewsPerDay="200"
      onMaxReviewsPerDayChange={vi.fn()}
      onMaxReviewsPerDayBlur={vi.fn()}
      enableFuzz={true}
      onEnableFuzzChange={vi.fn()}
      maxInterval="36500"
      onMaxIntervalChange={vi.fn()}
      onMaxIntervalBlur={vi.fn()}
      maxIntervalPlaceholder="36500"
      learningSteps="1m, 10m"
      onLearningStepsChange={vi.fn()}
      onLearningStepsBlur={vi.fn()}
      relearningSteps="10m"
      onRelearningStepsChange={vi.fn()}
      onRelearningStepsBlur={vi.fn()}
      leechThreshold="8"
      onLeechThresholdChange={vi.fn()}
      onLeechThresholdBlur={vi.fn()}
      leechAction="suspend"
      onLeechActionChange={vi.fn()}
      dailyReviewGoal="80"
      onDailyReviewGoalChange={vi.fn()}
      onDailyReviewGoalBlur={vi.fn()}
      sessionTimeLimit="30"
      onSessionTimeLimitChange={vi.fn()}
      onSessionTimeLimitBlur={vi.fn()}
    />,
  );
}

describe('SchedulingFieldsSection', () => {
  it('leads with workload and session goals, then discloses scheduler internals', () => {
    renderSection();

    const trigger = screen.getByRole('button', { name: 'Advanced scheduling' });
    const disclosure = document.getElementById(trigger.getAttribute('aria-controls')!);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure?.firstElementChild).toHaveAttribute('inert');
    expect(disclosure).not.toContainElement(screen.getByLabelText(/New cards per day/));
    expect(disclosure).not.toContainElement(screen.getByLabelText(/Daily review goal/));
    expect(screen.queryByLabelText('Target retention')).not.toBeInTheDocument();
    expect(disclosure).toContainElement(screen.getByLabelText(/Maximum interval/));

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(disclosure?.firstElementChild).not.toHaveAttribute('inert');
    fireEvent.click(trigger);
    expect(disclosure?.firstElementChild).toHaveAttribute('inert');
    fireEvent.click(trigger);
    expect(screen.getByLabelText(/Learning steps/)).toHaveValue('1m, 10m');
  });

  it('explains workload caps using current Course language', () => {
    renderSection();

    expect(screen.getByText(/so a large course does not overwhelm you/i)).toBeInTheDocument();
    expect(screen.queryByText(/large deck/i)).not.toBeInTheDocument();
  });
});
