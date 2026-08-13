import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/types';
import { FlipCard } from './FlipCard';

vi.mock('../../components/cards/CardContent', () => ({
  CardContent: ({ side }: { side: 'front' | 'back' }) => (
    <div>{side === 'front' ? 'audio face' : 'answer face'}</div>
  ),
}));

const card: Card = {
  id: 'audio-card',
  deckId: 'deck',
  schedulingUnitId: 'deck',
  type: 'front_back',
  front: `Listen\n\n![audio](lacuna-asset://${'a'.repeat(64)})`,
  back: 'Answer',
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [],
  createdAt: 0,
};

function renderRevealed() {
  const onHide = vi.fn();
  render(
    <FlipCard
      card={card}
      revealed
      phase="answer"
      motionSpeed="normal"
      isTouchMode={false}
      menuOpen={false}
      editing={false}
      navOpen={false}
      hintsOpen={false}
      onReveal={vi.fn()}
      onHide={onHide}
      onAnswer={vi.fn()}
      mode="fsrs"
      answerStrictness="standard"
    />,
  );
  return onHide;
}

describe('FlipCard audio replay', () => {
  it('returns to the audio face without leaving the answer phase', () => {
    const onHide = renderRevealed();
    expect(screen.getByText('answer face')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hear it again/ }));

    expect(screen.getByText('audio face')).toBeInTheDocument();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('uses R as the replay binding', () => {
    renderRevealed();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByText('audio face')).toBeInTheDocument();
  });
});
