import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnlockModeSection } from './UnlockModeSection';

describe('UnlockModeSection', () => {
  it('renders the three unlock modes and hides cadence fields outside linear', () => {
    render(
      <UnlockModeSection
        unlockMode="open"
        onUnlockModeChange={vi.fn()}
        linearCadence={{ anchorDate: Date.now(), intervalDays: 7 }}
        onLinearCadenceChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Semi-linear')).toBeInTheDocument();
    expect(screen.getByText('Linear')).toBeInTheDocument();
    expect(screen.queryByText('Days between lessons')).not.toBeInTheDocument();
  });

  it('shows cadence fields under linear mode', () => {
    render(
      <UnlockModeSection
        unlockMode="linear"
        onUnlockModeChange={vi.fn()}
        linearCadence={{ anchorDate: Date.now(), intervalDays: 7 }}
        onLinearCadenceChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Days between lessons')).toBeInTheDocument();
  });
});
