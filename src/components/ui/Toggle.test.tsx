import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('renders unchecked by default', () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Enable feature" />);
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Enable feature')).toBeInTheDocument();
  });

  it('renders checked state', () => {
    render(<Toggle checked={true} onChange={vi.fn()} label="Enable feature" />);
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when clicked', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('has an accessible label via id', () => {
    render(<Toggle checked={false} onChange={vi.fn()} id="test-toggle" label="Airplane mode" />);
    const switchBtn = screen.getByRole('switch', { name: 'Airplane mode' });
    expect(switchBtn).toHaveAttribute('id', 'test-toggle');
    expect(switchBtn).toHaveAttribute('aria-label', 'Airplane mode');
  });

  it('supports an accessible name without rendering duplicate visible text', () => {
    render(<Toggle checked={false} onChange={vi.fn()} ariaLabel="Randomise order" />);
    expect(screen.getByRole('switch', { name: 'Randomise order' })).toBeInTheDocument();
    expect(screen.queryByText('Randomise order')).not.toBeInTheDocument();
  });
});
