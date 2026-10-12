import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnlockModeSection } from './UnlockModeSection';

describe('UnlockModeSection', () => {
  it('renders the three unlock modes and hides cadence fields outside linear', () => {
    render(
      <UnlockModeSection
        unlockMode="open"
        onUnlockModeChange={vi.fn()}
        linearCadence={{ anchorDate: Date.now(), intervalDays: 7 }}
        onAnchorDateChange={vi.fn()}
        onIntervalDaysCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Semi-linear')).toBeInTheDocument();
    expect(screen.getByText('Linear')).toBeInTheDocument();
    expect(screen.queryByText('Days between lessons')).not.toBeInTheDocument();
    // Radios keep their own size: the text-field classes stretched each into a wide box.
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.className).not.toMatch(/\bw-full\b|\bpx-/);
    }
  });

  it('shows cadence fields under linear mode', () => {
    render(
      <UnlockModeSection
        unlockMode="linear"
        onUnlockModeChange={vi.fn()}
        linearCadence={{ anchorDate: Date.now(), intervalDays: 7 }}
        onAnchorDateChange={vi.fn()}
        onIntervalDaysCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('Days between lessons')).toBeInTheDocument();
  });

  it('does not turn a cleared interval into 1 before it is retyped', () => {
    const onIntervalDaysCommit = vi.fn();
    render(
      <UnlockModeSection
        unlockMode="linear"
        onUnlockModeChange={vi.fn()}
        linearCadence={{ anchorDate: Date.now(), intervalDays: 7 }}
        onAnchorDateChange={vi.fn()}
        onIntervalDaysCommit={onIntervalDaysCommit}
      />,
    );
    const days = screen.getByRole('spinbutton', { name: 'Days between lessons' });
    fireEvent.change(days, { target: { value: '' } });
    expect(days).toHaveValue(null);
    fireEvent.change(days, { target: { value: '14' } });
    fireEvent.blur(days);
    expect(onIntervalDaysCommit).toHaveBeenCalledExactlyOnceWith(14);
  });
});
