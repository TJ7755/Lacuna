import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { McpConsentPrompt } from './McpConsentPrompt';

describe('McpConsentPrompt', () => {
  it('shows the tool, scope and course then returns the decision', () => {
    const onDecision = vi.fn();
    render(<McpConsentPrompt request={{ id: '1', tool: 'lacuna.update_card', courseId: 'c1', scope: 'write' }} courseName="Biology" onDecision={onDecision} />);
    expect(screen.getByText(/Allow write access to Biology/)).toBeInTheDocument();
    expect(screen.getByText('lacuna.update_card')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Allow'));
    expect(onDecision).toHaveBeenCalledWith(true);
  });

  it('labels destructive access and can deny it', () => {
    const onDecision = vi.fn();
    render(<McpConsentPrompt request={{ id: '2', tool: 'lacuna.delete_card', courseId: 'c1', scope: 'destructive' }} courseName="Biology" onDecision={onDecision} />);
    expect(screen.getByText(/Allow destructive access/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onDecision).toHaveBeenCalledWith(false);
  });
});
