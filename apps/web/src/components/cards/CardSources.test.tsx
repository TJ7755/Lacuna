import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CardSources } from './CardSources';
import { CardTypePicker } from './CardTypePicker';
import type { CardImportContent } from '../../db/cardImport';
import type { Card } from '../../db/types';

let mockCourseCards: Card[] = [];
const mockEnsureLessonBackingDeck = vi.fn();
const mockEnsureCourseBankBackingDeck = vi.fn();
const mockImportCards = vi.fn();
const mockNotify = vi.fn();

vi.mock('../../state/useCourseData', () => ({
  useCourseCards: () => mockCourseCards,
  useLessons: () => [],
}));
vi.mock('../../db/backingDecks', () => ({
  ensureLessonBackingDeck: (...args: unknown[]) => mockEnsureLessonBackingDeck(...args),
  ensureCourseBankBackingDeck: (...args: unknown[]) => mockEnsureCourseBankBackingDeck(...args),
}));
vi.mock('../../db/cardImport', () => ({
  importCardCount: (content: { cards: unknown[] }) => content.cards.length,
  importCardsToDestination: (...args: unknown[]) => mockImportCards(...args),
}));
vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));
const textImport: CardImportContent = {
  kind: 'text',
  cards: [{ type: 'front_back', front: 'Q', back: 'A' }],
  reverse: false,
} as CardImportContent;
vi.mock('../import/CardImportDialog', () => ({
  CardImportDialog: ({ onImport }: { onImport: (content: CardImportContent) => void }) => (
    <div role="dialog">
      <button type="button" onClick={() => onImport(textImport)}>
        Import 1 card
      </button>
    </div>
  ),
}));
vi.mock('./LinkCardsDialog', () => ({
  LinkCardsDialog: ({ cards }: { cards: Card[] }) => (
    <div role="dialog" data-testid="candidates">
      {cards.map((card) => card.id).join(',')}
    </div>
  ),
}));

const card = {
  id: 'card-1',
  front: 'Cell membrane',
  back: 'Controls entry',
  primaryLessonId: 'lesson-2',
} as Card;

function renderSources(onAdded = vi.fn()) {
  render(
    <CardSources
      courseId="course-1"
      lessonId="lesson-1"
      targetName="Cells"
      lessonCards={[{ ...card, id: 'already-here' }]}
      onAdded={onAdded}
    />,
  );
  return onAdded;
}

beforeEach(() => {
  mockCourseCards = [card];
  mockEnsureLessonBackingDeck.mockReset().mockResolvedValue('deck-1');
  mockEnsureCourseBankBackingDeck.mockReset().mockResolvedValue('bank-1');
  mockImportCards.mockReset().mockResolvedValue(undefined);
  mockNotify.mockReset();
});

describe('CardSources', () => {
  it('offers import beside More while lesson linking waits for the further types', () => {
    render(
      <CardTypePicker
        value="front_back"
        onChange={vi.fn()}
        sources={(revealed) => (
          <CardSources
            courseId="course-1"
            lessonId="lesson-1"
            targetName="Cells"
            showLink={revealed}
            onAdded={vi.fn()}
          />
        )}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Link existing cards' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More card types' }));
    expect(screen.getByRole('button', { name: 'Link existing cards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basic (reversed)' })).toHaveFocus();
  });

  it('imports into the lesson, preparing an empty lesson first, then hands back', async () => {
    const onAdded = renderSources();
    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(mockEnsureLessonBackingDeck).toHaveBeenCalledWith('course-1', 'lesson-1');
    expect(mockImportCards).toHaveBeenCalledWith(
      { kind: 'existing', schedulingUnitId: 'deck-1' },
      textImport,
    );
    expect(mockNotify).toHaveBeenCalledWith('1 card imported.', 'positive');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers only ordinary cards not already in the lesson for linking', () => {
    mockCourseCards = [
      card,
      { ...card, id: 'already-here' },
      { ...card, id: 'sequence-card', sequenceItemId: 'item-1' },
      { ...card, id: 'occlusion-card', occlusionRegionId: 'region-1' },
    ];
    renderSources();
    fireEvent.click(screen.getByRole('button', { name: 'Link existing cards' }));
    expect(screen.getByTestId('candidates')).toHaveTextContent(/^card-1$/);
  });

  it("imports into the course's unassigned cards without a lesson, which has nothing to link", async () => {
    const onAdded = vi.fn();
    render(<CardSources courseId="course-1" targetName="Biology" onAdded={onAdded} />);
    expect(screen.queryByRole('button', { name: 'Link existing cards' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(mockEnsureCourseBankBackingDeck).toHaveBeenCalledWith('course-1');
    expect(mockEnsureLessonBackingDeck).not.toHaveBeenCalled();
    expect(mockImportCards).toHaveBeenCalledWith(
      { kind: 'existing', schedulingUnitId: 'bank-1' },
      textImport,
    );
  });
});
