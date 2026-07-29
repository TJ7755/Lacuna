import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PracticeSettingsSection } from './PracticeSettingsSection';

describe('PracticeSettingsSection', () => {
  it('renders all practice fields', () => {
    render(
      <PracticeSettingsSection
        autoPractice={true}
        onAutoPracticeChange={vi.fn()}
        practiceThresholdMinutesFar="30"
        onPracticeThresholdMinutesFarChange={vi.fn()}
        practiceThresholdMinutesNear="15"
        onPracticeThresholdMinutesNearChange={vi.fn()}
        practiceUrgentWindowDays="7"
        onPracticeUrgentWindowDaysChange={vi.fn()}
        practiceMaxGap="5"
        onPracticeMaxGapChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Auto-practice')).toBeInTheDocument();
    expect(screen.getByText('Threshold (exam not near)')).toBeInTheDocument();
    expect(screen.getByText('Threshold (exam near)')).toBeInTheDocument();
    expect(screen.getByText('Urgent window')).toBeInTheDocument();
    expect(screen.getByText('Maximum lesson gap')).toBeInTheDocument();
  });
});
