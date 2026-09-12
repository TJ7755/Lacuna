import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/types';
import { FlipCard } from './FlipCard';
import type * as MotionSpeedModule from '../../state/motionSpeed';

vi.mock('../../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));

vi.mock('../../components/cards/CardContent', () => ({
  CardContent: ({ side }: { side: 'front' | 'back' }) => (
    <div>{side === 'front' ? 'audio face' : 'answer face'}</div>
  ),
}));

const card: Card = {
  id: 'audio-card',
  conceptId: 'concept-audio-card',
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
  updatedAt: 0,
};

function renderRevealed(onAnswer = vi.fn()) {
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
      onAnswer={onAnswer}
      mode="fsrs"
      answerStrictness="standard"
    />,
  );
  return onHide;
}

describe('FlipCard reduced-motion swipes', () => {
  function swipe(dx: number, cancel = false) {
    const target = screen.getByRole('button', { name: 'Hide answer' });
    fireEvent.pointerDown(target, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 200 + dx, clientY: 200, pointerId: 1 });
    if (cancel) fireEvent.pointerCancel(target, { pointerId: 1 });
    else fireEvent.pointerUp(target, { clientX: 200 + dx, clientY: 200, pointerId: 1 });
  }

  it.each([-100, 100])('grades a %ipx swipe immediately and only once', (dx) => {
    const answer = vi.fn();
    renderRevealed(answer);
    swipe(dx);
    expect(answer).toHaveBeenCalledExactlyOnceWith(dx > 0, 'touch');
    swipe(dx);
    expect(answer).toHaveBeenCalledOnce();
  });

  it('keeps cancelled and below-threshold swipes ungraded, then accepts a new swipe', () => {
    const answer = vi.fn();
    renderRevealed(answer);
    swipe(40);
    swipe(-100, true);
    expect(answer).not.toHaveBeenCalled();
    swipe(100);
    expect(answer).toHaveBeenCalledExactlyOnceWith(true, 'touch');
  });
});

describe('FlipCard audio replay', () => {
  it('returns to the audio face without leaving the answer phase', () => {
    const onHide = renderRevealed();
    const card = screen.getByRole('button', { name: 'Hide answer' });
    expect(
      within(card.querySelector('[data-study-face]') as HTMLElement).getByText('answer face'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hear it again/ }));

    const replayedCard = screen.getByRole('button', { name: 'Show answer again' });
    expect(
      within(replayedCard.querySelector('[data-study-face]') as HTMLElement).getByText(
        'audio face',
      ),
    ).toBeInTheDocument();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('uses R as the replay binding', () => {
    renderRevealed();
    fireEvent.keyDown(window, { key: 'r' });
    const card = screen.getByRole('button', { name: 'Show answer again' });
    expect(
      within(card.querySelector('[data-study-face]') as HTMLElement).getByText('audio face'),
    ).toBeInTheDocument();
  });
});

describe('FlipCard hint disclosure', () => {
  it('states the silent-grading timing adjustment beside a revealed hint', () => {
    render(
      <FlipCard
        card={{ ...card, front: 'Prompt' }}
        revealed={false}
        phase="question"
        motionSpeed="normal"
        isTouchMode={false}
        menuOpen={false}
        editing={false}
        navOpen={false}
        hintsOpen={false}
        onReveal={vi.fn()}
        onHide={vi.fn()}
        onAnswer={vi.fn()}
        mode="fsrs"
        isLinesModeCard
        hintStep={1}
        onRevealHint={vi.fn()}
        hintAffectsScheduling
        answerStrictness="standard"
      />,
    );

    expect(
      within(
        screen.getByRole('button', { name: 'Show answer' }).querySelector('[data-study-face]')!
          .parentElement!,
      ).getByText('Hints add 1.5 seconds to the response time used for silent grading.'),
    ).toBeInTheDocument();
  });
});
