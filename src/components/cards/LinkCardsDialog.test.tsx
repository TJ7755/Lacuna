import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkCardsDialog } from './LinkCardsDialog';
import type { Card, Lesson } from '../../db/types';

const mockNotify = vi.fn();
const mockLinkCardsToLesson = vi.fn();

vi.mock('../../db/repository', () => ({
  linkCardsToLesson: (...args: unknown[]) => mockLinkCardsToLesson(...args),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

const lessons: Lesson[] = [
  {
    id: 'lesson-1',
    courseId: 'course-1',
    name: 'Cells',
    description: '',
    orderIndex: 0,
    createdAt: 1,
    isExtension: false,
  },
];

function card(id: string, front: string, back: string, primaryLessonId: string | null): Card {
  return {
    id,
    deckId: 'deck-1',
    type: 'front_back',
    front,
    back,
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
    createdAt: 1,
    tags: [],
    suspended: false,
    buriedUntil: null,
    courseId: 'course-1',
    primaryLessonId,
  };
}

beforeEach(() => {
  mockNotify.mockReset();
  mockLinkCardsToLesson.mockReset();
  mockLinkCardsToLesson.mockResolvedValue(undefined);
});

describe('LinkCardsDialog', () => {
  it('searches card fronts and backs and shows primary lesson context', () => {
    render(
      <LinkCardsDialog
        lessonId="lesson-2"
        cards={[
          card('card-1', 'Cell membrane', 'Controls entry', 'lesson-1'),
          card('card-2', 'Mitochondria', 'Aerobic respiration', null),
        ]}
        lessons={lessons}
        onLinked={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('From Cells')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search cards…'), {
      target: { value: 'respiration' },
    });
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
    expect(screen.queryByText('Cell membrane')).not.toBeInTheDocument();
  });

  it('links every selected card to the current lesson', async () => {
    const onLinked = vi.fn();
    render(
      <LinkCardsDialog
        lessonId="lesson-2"
        cards={[
          card('card-1', 'Cell membrane', 'Controls entry', 'lesson-1'),
          card('card-2', 'Mitochondria', 'Aerobic respiration', null),
        ]}
        lessons={lessons}
        onLinked={onLinked}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Cell membrane'));
    fireEvent.click(screen.getByText('Mitochondria'));
    fireEvent.click(screen.getByRole('button', { name: 'Link 2 cards' }));

    await waitFor(() => {
      expect(mockLinkCardsToLesson).toHaveBeenCalledOnce();
      expect(mockLinkCardsToLesson).toHaveBeenCalledWith(
        'lesson-2',
        expect.arrayContaining(['card-1', 'card-2']),
      );
      expect(onLinked).toHaveBeenCalledOnce();
    });
  });

  it('focuses search first and returns focus to the opener when closed', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open picker</button>
          {open && (
            <LinkCardsDialog
              lessonId="lesson-2"
              cards={[card('card-1', 'Cell membrane', 'Controls entry', 'lesson-1')]}
              lessons={lessons}
              onLinked={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open picker' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByPlaceholderText('Search cards…')).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Close card picker' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
