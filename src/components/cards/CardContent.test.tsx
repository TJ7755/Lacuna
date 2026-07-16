import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardContent } from './CardContent';
import type { Card } from '../../db/types';

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    type: 'front_back',
    front: 'Front text',
    back: 'Back text',
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
    createdAt: Date.now(),
    tags: [],
    suspended: false,
    buriedUntil: null,
    courseId: 'course-1',
    primaryLessonId: null,
    ...overrides,
  };
}

describe('CardContent', () => {
  it('renders a muted cue block above a "Next item?" prompt for a positional sequence card front', () => {
    const card = makeCard({
      front: '**Cranial Nerves**\n\nOlfactory\n\nOptic',
      sequenceItemId: 'item-3',
    });
    render(<CardContent card={card} side="front" sequenceCue />);
    expect(screen.getByText('Cranial Nerves')).toBeInTheDocument();
    expect(screen.getByText('Olfactory')).toBeInTheDocument();
    expect(screen.getByText('Optic')).toBeInTheDocument();
    expect(screen.getByText('Next item?')).toBeInTheDocument();
  });

  it("renders the literal first-item prompt without a cue block", () => {
    const card = makeCard({
      front: '**Cranial Nerves**\n\nFirst item?',
      sequenceItemId: 'item-1',
    });
    render(<CardContent card={card} side="front" sequenceCue />);
    expect(screen.getByText('Cranial Nerves')).toBeInTheDocument();
    expect(screen.getByText('First item?')).toBeInTheDocument();
  });

  it('renders the literal first-line prompt without treating it as cue text', () => {
    const card = makeCard({
      front: '**Hamlet**\n\nFirst line?',
      sequenceItemId: 'line-1',
    });
    render(<CardContent card={card} side="front" sequenceCue sequenceMode="lines" />);
    expect(screen.getByText('First line?')).toBeInTheDocument();
    expect(screen.queryByText('Next line?')).not.toBeInTheDocument();
  });

  it('uses line-specific wording after a lines-mode cue block', () => {
    const card = makeCard({
      front: '**Hamlet**\n\nTo be, or not to be',
      sequenceItemId: 'line-2',
    });
    render(<CardContent card={card} side="front" sequenceCue sequenceMode="lines" />);
    expect(screen.getByText('To be, or not to be')).toBeInTheDocument();
    expect(screen.getByText('Next line?')).toBeInTheDocument();
    expect(screen.queryByText('Next item?')).not.toBeInTheDocument();
  });

  it('does not apply cue styling to a label card front', () => {
    const card = makeCard({
      front: 'Olfactory → ?',
      sequenceItemId: 'item-3::label',
    });
    render(<CardContent card={card} side="front" sequenceCue />);
    expect(screen.getByText('Olfactory → ?')).toBeInTheDocument();
    expect(screen.queryByText('Next item?')).not.toBeInTheDocument();
  });

  it('does not apply cue styling to an ordinary card front', () => {
    const card = makeCard({ front: 'Plain front' });
    render(<CardContent card={card} side="front" sequenceCue />);
    expect(screen.getByText('Plain front')).toBeInTheDocument();
    expect(screen.queryByText('Next item?')).not.toBeInTheDocument();
  });

  it('leaves a positional sequence card unstyled when sequenceCue is not set', () => {
    const card = makeCard({
      front: '**Cranial Nerves**\n\nOlfactory',
      sequenceItemId: 'item-2',
    });
    render(<CardContent card={card} side="front" />);
    expect(screen.queryByText('Next item?')).not.toBeInTheDocument();
  });
});
