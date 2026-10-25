import {
  dataHooks,
  mockCard,
  mockCard2,
  mockContext,
  resetCardListFixtures,
} from './CardList.testFixtures';
import { CardList } from './CardList';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Card } from '../../db/types';
describe('CardList rendering', () => {
  beforeEach(resetCardListFixtures);

  it('keeps lesson selection in its heading and exposes compact card kinds', async () => {
    render(
      <CardList
        cards={[mockCard, { ...mockCard2, type: 'cloze' }]}
        context={mockContext}
        onEditCard={vi.fn()}
        heading={<h2>Manage (2)</h2>}
        beforeCards={<p>Answer by</p>}
        compactMetadata
      />,
    );
    const heading = screen.getByRole('heading', { name: 'Manage (2)' });
    expect(heading.parentElement).toContainElement(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('img', { name: 'Front / back' })).toHaveAttribute(
      'title',
      'Front / back',
    );
    expect(screen.getByRole('img', { name: 'Cloze' })).toHaveAttribute('title', 'Cloze');
    expect(await screen.findByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('geography')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const card = screen.getByRole('button', {
      name: 'Select card: What is the capital of France?',
    });
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(
      screen.getByRole('button', { name: 'Card details: What is the capital of France?' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('provides a named details control and keeps the covered swipe tray inert', async () => {
    const { container } = render(
      <CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />,
    );
    const details = screen.getByRole('button', {
      name: 'Card details: What is the capital of France?',
    });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-card-swipe-tray]')).toHaveAttribute('inert');
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('card-analytics')).toBeInTheDocument();
  });

  it('tints a hovered row without letting the swipe tray show through', () => {
    const { container } = render(
      <CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />,
    );
    const row = container.querySelector('[data-card-id]')!;
    // Every background the row can take must be opaque, or the tray behind it shows.
    const backgrounds = row.className.split(/\s+/).filter((name) => /(^|:)bg-/.test(name));
    expect(backgrounds.length).toBeGreaterThan(0);
    for (const name of backgrounds) expect(name).not.toContain('/');
  });

  it('hides the swipe tray while the row is at rest', () => {
    const { container } = render(
      <CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />,
    );
    // Its tinted buttons showed through the row's rounded corners on every row.
    expect(container.querySelector<HTMLElement>('[data-card-swipe-tray]')!.style.visibility).toBe(
      'hidden',
    );
  });

  it('renders empty state when no cards', () => {
    const onEditCard = vi.fn();
    const consoleError = vi.spyOn(console, 'error');
    try {
      render(<CardList cards={[]} context={mockContext} onEditCard={onEditCard} />);
      expect(screen.getByText('No cards yet.')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('Function components cannot be given refs'),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('opens analytics with a Course card-list context', async () => {
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);

    fireEvent.click(await screen.findByText('What is the capital of France?'));
    expect(await screen.findByTestId('card-analytics')).toBeInTheDocument();
  });

  it('hydrates canonical history for an expanded raw card even when its reps projection is zero', async () => {
    const review = {
      timestamp: Date.now(),
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 1,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    const rawReviewed = {
      ...mockCard,
      reps: 0,
    };
    dataHooks.useCard.mockImplementation((id?: string) =>
      id === rawReviewed.id ? { ...rawReviewed, history: [review] } : null,
    );

    render(<CardList cards={[rawReviewed]} context={mockContext} onEditCard={vi.fn()} />);
    expect(dataHooks.useCard).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText('What is the capital of France?'));
    expect(await screen.findByText('Analytics history: 1')).toBeInTheDocument();
    expect(dataHooks.useCard).toHaveBeenLastCalledWith(rawReviewed.id);
  });

  it('does not reload canonical history supplied by an already-hydrated caller', async () => {
    const hydrated = {
      ...mockCard,
      history: [
        {
          timestamp: Date.now(),
          grade: 3 as const,
          responseTimeSec: 2,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 1,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
      ],
    };

    render(<CardList cards={[hydrated]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(await screen.findByText('What is the capital of France?'));

    expect(await screen.findByText('Analytics history: 1')).toBeInTheDocument();
    expect(dataHooks.useCard).not.toHaveBeenCalled();
  });

  it('renders cards with front content', async () => {
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
    expect(await screen.findByText('What is the capital of France?')).toBeInTheDocument();
    expect(screen.getByText('geography')).toBeInTheDocument();
  });

  it('uses the Working badge for working-item cards stored as front/back cards', () => {
    const workingCard: Card = {
      ...mockCard,
      payload: { v: 1, kind: 'working', scheme: [] },
    };
    render(<CardList cards={[workingCard]} context={mockContext} onEditCard={vi.fn()} />);

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.queryByText('Front / back')).not.toBeInTheDocument();
  });

  it('expands a card to show analytics', async () => {
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
    const cardRow = await screen.findByText('What is the capital of France?');
    fireEvent.click(cardRow);
    const analytics = await screen.findByTestId('card-analytics');
    expect(analytics).toBeInTheDocument();
  });

  it('marks linked cards and removes their lesson link instead of deleting the card', async () => {
    const { deleteCards } = await import('../../db/cardRepository');
    const onUnlinkCard = vi.fn();
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onEditCard={vi.fn()}
        linkedCardIds={new Set([mockCard.id])}
        onUnlinkCard={onUnlinkCard}
      />,
    );

    expect(screen.getByText('Linked')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Remove from lesson'));
    expect(onUnlinkCard).toHaveBeenCalledWith(mockCard);
    expect(deleteCards).not.toHaveBeenCalled();
    expect(screen.queryByText('Select')).not.toBeInTheDocument();
  });
});
