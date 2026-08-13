import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TouchBottomSheet } from './TouchBottomSheet';

function renderSheet(
  phase: 'question' | 'answer',
  onReveal = vi.fn(),
  onAnswer = vi.fn(),
) {
  return render(
    <TouchBottomSheet
      phase={phase}
      gradingMode="silent"
      onReveal={onReveal}
      onHide={vi.fn()}
      onAnswer={onAnswer}
      m={0}
    />,
  );
}

describe('TouchBottomSheet', () => {
  it('keeps one sheet chrome when the question step becomes the grade step', () => {
    const { rerender } = renderSheet('question');
    const reveal = screen.getByRole('button', { name: 'Show answer' });
    const sheet = reveal.closest('.fixed');
    expect(sheet).toHaveClass('bottom-0');

    rerender(
      <TouchBottomSheet
        phase="answer"
        gradingMode="silent"
        onReveal={vi.fn()}
        onHide={vi.fn()}
        onAnswer={vi.fn()}
        m={0}
      />,
    );

    expect(screen.getByRole('button', { name: 'Yes' }).closest('.fixed')).toBe(sheet);
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
  });

  it('reveals from the stable sheet', () => {
    const onReveal = vi.fn();
    renderSheet('question', onReveal);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
