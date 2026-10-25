import {
  mockNotify,
  mockCard,
  mockCard2,
  mockContext,
  resetCardListFixtures,
} from './CardList.testFixtures';
import { CardList } from './CardList';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
describe('CardList selection and reversible actions', () => {
  beforeEach(resetCardListFixtures);

  it('shows select mode when Select button is clicked', () => {
    render(<CardList cards={[mockCard, mockCard2]} context={mockContext} onEditCard={vi.fn()} />);
    const selectBtn = screen.getByText('Select');
    fireEvent.click(selectBtn);
    expect(screen.getByText('Select all')).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('toggles card selection in select mode', () => {
    render(<CardList cards={[mockCard, mockCard2]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('does not show "Assign to lesson…" without assignableLessons/courseId', () => {
    render(<CardList cards={[mockCard, mockCard2]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(screen.getByText('Select'));
    expect(screen.queryByText('Assign to lesson…')).not.toBeInTheDocument();
  });

  it('bulk-assigns selected cards to a lesson', async () => {
    const { assignCardsToLesson } = await import('../../db/cardRepository');
    render(
      <CardList
        cards={[mockCard, mockCard2]}
        context={mockContext}
        onEditCard={vi.fn()}
        courseId="course-1"
        assignableLessons={[{ id: 'lesson-1', name: 'Lesson 1' }]}
      />,
    );
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Assign to lesson…'));
    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() =>
      expect(assignCardsToLesson).toHaveBeenCalledWith(
        ['card-1', 'card-2'],
        'course-1',
        'lesson-1',
      ),
    );
  });

  it('unassigns selected cards when the Unassigned option is chosen', async () => {
    const { assignCardsToLesson } = await import('../../db/cardRepository');
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onEditCard={vi.fn()}
        courseId="course-1"
        assignableLessons={[{ id: 'lesson-1', name: 'Lesson 1' }]}
      />,
    );
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Assign to lesson…'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() =>
      expect(assignCardsToLesson).toHaveBeenCalledWith(['card-1'], 'course-1', null),
    );
  });

  it('reports a rejected row deletion without an unhandled rejection or success toast', async () => {
    const { deleteCards } = await import('../../db/cardRepository');
    vi.mocked(deleteCards).mockRejectedValueOnce(new Error('This published course is locked.'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
      fireEvent.click(screen.getByTitle('Delete card'));

      await waitFor(() =>
        expect(mockNotify).toHaveBeenCalledWith('Could not delete the card.', 'negative'),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalledWith('Card deleted.', 'neutral', expect.anything());
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('reports a failed bulk delete, keeps select mode and raises no unhandled rejection', async () => {
    const { deleteCards } = await import('../../db/cardRepository');
    vi.mocked(deleteCards).mockRejectedValueOnce(new Error('write failed'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(<CardList cards={[mockCard, mockCard2]} context={mockContext} onEditCard={vi.fn()} />);
      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByText('Select all'));
      fireEvent.click(screen.getAllByText('Delete')[0]);

      await waitFor(() =>
        expect(mockNotify).toHaveBeenCalledWith('Could not delete the selected cards.', 'negative'),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText('Deselect all')).toBeInTheDocument();
      expect(mockNotify).not.toHaveBeenCalledWith(
        expect.stringContaining('deleted.'),
        'neutral',
        expect.anything(),
      );
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('reports a failed bulk suspend and keeps select mode', async () => {
    const { setCardsSuspended } = await import('../../db/cardRepository');
    vi.mocked(setCardsSuspended).mockRejectedValueOnce(new Error('write failed'));
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Suspend'));

    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('Could not suspend the selected cards.', 'negative'),
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Deselect all')).toBeInTheDocument();
  });

  it('offers Undo after a successful bulk delete', async () => {
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getAllByText('Delete')[0]);

    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('1 card deleted.', 'neutral', {
        actionLabel: 'Undo',
        onAction: expect.any(Function),
      }),
    );
  });

  it('enters the tag field and returns focus to Select once the cards are tagged', async () => {
    const { addTagToCards } = await import('../../db/cardRepository');
    vi.mocked(addTagToCards).mockResolvedValueOnce(undefined);
    render(<CardList cards={[mockCard]} context={mockContext} onEditCard={vi.fn()} />);
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Tag…'));
    const field = screen.getByPlaceholderText('Type a tag…');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'exam' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(addTagToCards).toHaveBeenCalledWith([mockCard.id], 'exam'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select' })).toHaveFocus());
  });
});
