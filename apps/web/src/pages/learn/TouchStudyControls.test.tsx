import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TouchStudyControls } from './TouchStudyControls';

function renderSheet(phase: 'question' | 'answer', onReveal = vi.fn(), onAnswer = vi.fn()) {
  return render(
    <TouchStudyControls
      phase={phase}
      gradingMode="silent"
      onReveal={onReveal}
      onAnswer={onAnswer}
      m={0}
    />,
  );
}

describe('TouchStudyControls', () => {
  it('keeps the notification anchor when the question step becomes the grade step', () => {
    const { rerender } = renderSheet('question');
    const reveal = screen.getByRole('button', { name: 'Show answer' });
    const controls = reveal.closest('.study-touch-controls');
    expect(controls).not.toBeNull();

    rerender(
      <TouchStudyControls
        phase="answer"
        gradingMode="silent"
        onReveal={vi.fn()}
        onAnswer={vi.fn()}
        m={0}
      />,
    );

    expect(screen.getByRole('button', { name: 'Yes' }).closest('.study-touch-controls')).toBe(
      controls,
    );
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
  });

  it('reveals from the touch controls', () => {
    const onReveal = vi.fn();
    renderSheet('question', onReveal);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('keeps the self-marking grades away while automatic marking owns the answer', () => {
    render(
      <TouchStudyControls
        phase="answer"
        gradingMode="silent"
        onReveal={vi.fn()}
        onAnswer={vi.fn()}
        m={0}
        autoMark={{ pending: false, correct: true }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'No' })).toBeNull();
  });
});
