import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct accessibility attributes', () => {
    render(<ProgressBar value={0.5} label="Upload progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-label', 'Upload progress');
  });

  it('clamps value to 0..1 range', () => {
    render(<ProgressBar value={-0.5} showLabel />);
    expect(screen.getByText('0%')).toBeInTheDocument();

    render(<ProgressBar value={1.5} showLabel />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
