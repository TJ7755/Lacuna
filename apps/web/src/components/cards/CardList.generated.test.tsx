import { mockCard, mockContext, resetCardListFixtures } from './CardList.testFixtures';
import { CardList } from './CardList';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Card, Occlusion, Sequence } from '@lacuna/core/db/types';
describe('CardList generated ownership', () => {
  beforeEach(resetCardListFixtures);

  describe('generated cards', () => {
    const sequence: Sequence = {
      id: 'sequence-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'The alkali metals',
      items: [{ id: 'item-1', value: 'Sodium' }],
      cueWindow: 2,
      createdAt: Date.now(),
      updatedAt: 1,
    };
    const generatedCard: Card = {
      ...mockCard,
      id: 'card-3',
      front: '**The alkali metals**\n\nFirst item?',
      back: 'Sodium',
      sequenceItemId: 'item-1',
    };

    it('groups a generated card under a sequence header with a card count', async () => {
      render(
        <CardList
          cards={[mockCard, generatedCard]}
          context={mockContext}
          onEditCard={vi.fn()}
          sequences={[sequence]}
        />,
      );
      expect(screen.getByText('The alkali metals')).toBeInTheDocument();
      expect(screen.getByText('1 card')).toBeInTheDocument();
      // The ordinary card still renders in the loose list underneath.
      expect(await screen.findByText('What is the capital of France?')).toBeInTheDocument();
    });

    it('shows an "Edit sequence" link that calls onEditSequence with the sequence id', () => {
      const onEditSequence = vi.fn();
      render(
        <CardList
          cards={[generatedCard]}
          context={mockContext}
          onEditCard={vi.fn()}
          sequences={[sequence]}
          onEditSequence={onEditSequence}
        />,
      );
      fireEvent.click(screen.getByText('Edit sequence'));
      expect(onEditSequence).toHaveBeenCalledWith('sequence-1');
    });

    it('lists a sequence’s cards in item order, each label card after its item', async () => {
      const ordered: Sequence = {
        ...sequence,
        items: [
          { id: 'item-1', value: 'Sodium' },
          { id: 'item-2', value: 'Potassium' },
        ],
      };
      const card = (id: string, sequenceItemId: string, back: string): Card => ({
        ...mockCard,
        id,
        front: id,
        back,
        sequenceItemId,
      });
      render(
        <CardList
          cards={[
            card('c-2', 'item-2', 'Potassium'),
            card('c-1-label', 'item-1::label', 'Sodium label'),
            card('c-1', 'item-1', 'Sodium'),
          ]}
          context={mockContext}
          onEditCard={vi.fn()}
          sequences={[ordered]}
        />,
      );
      await screen.findByText('Potassium');
      const backs = ['Sodium', 'Sodium label', 'Potassium'].map((text) => screen.getByText(text));
      for (let i = 1; i < backs.length; i++) {
        expect(
          backs[i - 1].compareDocumentPosition(backs[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('badges a generated card and hides its select checkbox and delete action', () => {
      render(
        <CardList
          cards={[mockCard, generatedCard]}
          context={mockContext}
          onEditCard={vi.fn()}
          sequences={[sequence]}
        />,
      );
      expect(screen.getByText('Sequence')).toBeInTheDocument();
      expect(screen.getAllByText('Sequence')).toHaveLength(1);
      expect(screen.getAllByText('Front / back')).toHaveLength(1);

      fireEvent.click(screen.getByText('Select'));
      // Only the ordinary card is selectable: "Select all" only ever selects it.
      fireEvent.click(screen.getByText('Select all'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    const occlusion: Occlusion = {
      id: 'occlusion-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'The heart',
      assetHash: 'hash-1',
      regions: [{ id: 'region-1', role: 'label', shape: 'rectangle', x: 0, y: 0, w: 0.1, h: 0.1 }],
      createdAt: Date.now(),
      updatedAt: 1,
    };
    const occlusionCard: Card = {
      ...mockCard,
      id: 'card-4',
      front: 'Label 1 of 1 — The heart',
      back: 'Label 1 of 1 — The heart\n\nAorta',
      occlusionRegionId: 'region-1',
    };

    it('groups an occlusion-generated card under an occlusion header, badges it, and hides its select checkbox and delete action', () => {
      const onEditOcclusion = vi.fn();
      render(
        <CardList
          cards={[mockCard, occlusionCard]}
          context={mockContext}
          onEditCard={vi.fn()}
          occlusions={[occlusion]}
          onEditOcclusion={onEditOcclusion}
        />,
      );
      expect(screen.getByText('The heart')).toBeInTheDocument();
      expect(screen.getByText('1 card')).toBeInTheDocument();
      expect(screen.getByText('Occlusion')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Edit occlusion'));
      expect(onEditOcclusion).toHaveBeenCalledWith('occlusion-1');

      fireEvent.click(screen.getByText('Select'));
      // Only the ordinary card is selectable: "Select all" only ever selects it.
      fireEvent.click(screen.getByText('Select all'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('previews an occlusion card as its diagram and answers with the region it asks about', async () => {
      const { container } = render(
        <CardList
          cards={[occlusionCard]}
          context={mockContext}
          onEditCard={vi.fn()}
          occlusions={[
            { ...occlusion, regions: [{ ...occlusion.regions[0], answerText: 'Aorta' }] },
          ]}
        />,
      );
      expect(container.querySelector('[data-occlusion-thumbnail]')).not.toBeNull();
      expect(container.querySelector('[data-card-answer]')).toHaveTextContent(/^Aorta$/);
      // The stored fallback back repeats the front, so it is not what the row shows.
      await waitFor(() =>
        expect(container.querySelector('[data-card-answer]')).not.toHaveTextContent('Label 1 of 1'),
      );
    });

    it('keeps owner kinds distinct, orders regions and leaves unresolved generated cards read-only', () => {
      const diagram = {
        ...occlusion,
        id: sequence.id,
        regions: [occlusion.regions[0], { ...occlusion.regions[0], id: 'region-2' }],
      };
      const laterRegion = { ...occlusionCard, id: 'later-region', occlusionRegionId: 'region-2' };
      const orphan = { ...generatedCard, id: 'orphan', sequenceItemId: 'missing-item' };
      const cards = [mockCard, laterRegion, generatedCard, occlusionCard, orphan];
      const { container } = render(
        <CardList
          cards={cards}
          context={mockContext}
          onEditCard={vi.fn()}
          sequences={[sequence]}
          occlusions={[diagram]}
        />,
      );

      expect(screen.getByText('The heart')).toBeInTheDocument();
      expect(screen.getByText('The alkali metals')).toBeInTheDocument();
      expect(
        [...container.querySelectorAll('[data-card-id]')].map((row) =>
          row.getAttribute('data-card-id'),
        ),
      ).toEqual([occlusionCard.id, laterRegion.id, generatedCard.id, mockCard.id, orphan.id]);
      expect(cards.map((card) => card.id)).toEqual([
        mockCard.id,
        laterRegion.id,
        generatedCard.id,
        occlusionCard.id,
        orphan.id,
      ]);
      expect(container.querySelector('[data-card-id="orphan"]')).toHaveTextContent('Sequence');
      expect(screen.getAllByTitle('Delete card')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByText('Select all'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('renders unresolved sequence and occlusion cards when owner collections are absent', () => {
      const { container } = render(
        <CardList
          cards={[generatedCard, occlusionCard]}
          context={mockContext}
          onEditCard={vi.fn()}
        />,
      );

      expect(container.querySelectorAll('[data-card-id]')).toHaveLength(2);
      expect(screen.getByText('Sequence')).toBeInTheDocument();
      expect(screen.getByText('Occlusion')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete card')).not.toBeInTheDocument();
    });

    it('retains each group expansion when owners reorder and selection mode changes', async () => {
      const props = {
        cards: [generatedCard, occlusionCard, mockCard],
        context: mockContext,
        onEditCard: vi.fn(),
        sequences: [sequence],
        occlusions: [occlusion],
      };
      const { rerender } = render(<CardList {...props} />);
      const sequenceDetails = screen.getByRole('button', {
        name: 'Card details: **The alkali metals** First item?',
      });
      const occlusionDetails = screen.getByRole('button', {
        name: `Card details: ${occlusionCard.front}`,
      });
      const ordinaryDetails = screen.getByRole('button', {
        name: `Card details: ${mockCard.front}`,
      });
      fireEvent.click(sequenceDetails);
      fireEvent.click(occlusionDetails);
      fireEvent.click(ordinaryDetails);
      await waitFor(() => expect(screen.getAllByTestId('card-analytics')).toHaveLength(3));

      rerender(<CardList {...props} cards={[occlusionCard, mockCard, generatedCard]} />);
      expect(sequenceDetails).toBeInTheDocument();
      expect(occlusionDetails).toBeInTheDocument();
      expect(sequenceDetails).toHaveAttribute('aria-expanded', 'true');
      expect(occlusionDetails).toHaveAttribute('aria-expanded', 'true');
      expect(ordinaryDetails).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      expect(sequenceDetails).toHaveAttribute('aria-expanded', 'true');
      expect(occlusionDetails).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(ordinaryDetails).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
