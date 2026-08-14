import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardList } from './CardList';
import type { Card, LegacyDeckRecord, Occlusion, Sequence } from '../../db/types';
import type { ApkgImportResult } from '../../db/apkgImport';
import { courseCardListContext, type CardListContext } from './cardListContext';

const mockNotify = vi.fn();

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../../state/inputMode', () => ({
  useIsTouchMode: () => false,
}));

vi.mock('../../db/repository', () => ({
  addTagToCards: vi.fn(),
  assignCardsToLesson: vi.fn(),
  createCards: vi.fn(),
  deleteCards: vi.fn(),
  removeTagFromCards: vi.fn(),
  restoreCards: vi.fn(),
  setCardsSuspended: vi.fn(),
  setCardFlag: vi.fn(),
  snapshotCards: vi.fn(() => Promise.resolve([])),
  unsuspendCard: vi.fn(),
}));

vi.mock('../../fsrs/leech', () => ({
  isLeech: vi.fn(() => false),
}));

vi.mock('../ui/icons', () => ({
  CheckIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="check-icon" {...props} />,
  CloseIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="close-icon" {...props} />,
  EditIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="edit-icon" {...props} />,
  FlagIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="flag-icon" {...props} />,
  ImageIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="image-icon" {...props} />,
  MoreIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="more-icon" {...props} />,
  PathIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="path-icon" {...props} />,
  PlusIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="plus-icon" {...props} />,
  TagIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="tag-icon" {...props} />,
  TrashIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="trash-icon" {...props} />,
  UploadIcon: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="upload-icon" {...props} />,
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => <div data-testid="markdown-view">{source}</div>,
}));

vi.mock('../ui/Button', () => ({
  // Forwards the accessibility props too: an icon-only trigger has no text to query by,
  // so dropping aria-label here would make it unreachable from a test.
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} data-testid="button" {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('./CardAnalytics', () => ({
  CardAnalytics: () => <div data-testid="card-analytics">Analytics</div>,
}));

vi.mock('../import/UnifiedImportPanel', () => ({
  UnifiedImportPanel: ({
    deckId,
    onImport,
    onApkgImport,
  }: {
    deckId?: string;
    onImport?: (cards: never[]) => void;
    onApkgImport?: (result: ApkgImportResult) => void;
  }) => (
    <div data-testid="import-panel">
      <span data-testid="import-target">{deckId}</span>
      <button type="button" onClick={() => onImport?.([])}>Trigger import</button>
      <button
        type="button"
        onClick={() =>
          onApkgImport?.({
            deckName: 'Imported',
            cards: [],
            media: new Map(),
            skippedNotes: 0,
            skippedCards: 0,
          })
        }
      >
        Trigger APKG import
      </button>
    </div>
  ),
}));

const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Test LegacyDeckRecord',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  fsrsVersion: 6,
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
  examObjective: 'expectedMarks',
  lastInteractedAt: Date.now(),
};

const mockCard: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  schedulingUnitId: 'deck-1',
  type: 'front_back',
  front: 'What is the capital of France?',
  back: 'Paris',
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
  updatedAt: 1,
  tags: ['geography'],
  suspended: false,
  buriedUntil: null,
};

const mockCard2: Card = {
  ...mockCard,
  id: 'card-2',
  front: 'What is 2 + 2?',
  back: '4',
  tags: ['math'],
};

const mockContext = courseCardListContext({
  schedulingConfig: mockDeck,
  courseId: 'course-1',
  primaryLessonId: null,
  importTargetName: mockDeck.name,
});

beforeEach(() => {
  mockNotify.mockClear();
});

/**
 * Opens the "More ways to add cards" menu. New card is the header's only primary action;
 * sequences, occlusions, linking and importing sit behind this trigger.
 */
function openAddMenu() {
  fireEvent.click(screen.getByLabelText('More ways to add cards'));
}

describe('CardList', () => {
  it('renders empty state when no cards', () => {
    const onNewCard = vi.fn();
    const onEditCard = vi.fn();
    render(
      <CardList
        cards={[]}
        context={mockContext}
        onNewCard={onNewCard}
        onEditCard={onEditCard}
      />
    );
    expect(screen.getByText('No cards yet.')).toBeInTheDocument();
    expect(screen.getAllByText('New card')).not.toHaveLength(0);
  });

  it('opens analytics with a Course card-list context', async () => {
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onEditCard={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText('What is the capital of France?'));
    expect(await screen.findByTestId('card-analytics')).toBeInTheDocument();
  });

  it('routes APKG imports through the context capability', async () => {
    const onApkgImport = vi.fn();
    const context: CardListContext = {
      schedulingConfig: mockDeck,
      importTargetName: 'Course bank',
      onImport: vi.fn(),
      onApkgImport,
      onRestore: vi.fn(),
    };
    render(<CardList cards={[mockCard]} context={context} onEditCard={vi.fn()} />);

    openAddMenu();
    fireEvent.click(screen.getByText('Import cards'));
    fireEvent.click(screen.getByText('Trigger APKG import'));
    await waitFor(() =>
      expect(onApkgImport).toHaveBeenCalledWith({
        deckName: 'Imported',
        cards: [],
        media: new Map(),
        skippedNotes: 0,
        skippedCards: 0,
      }),
    );
  });

  it('renders cards with front content', async () => {
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    expect(await screen.findByText('What is the capital of France?')).toBeInTheDocument();
    expect(screen.getByText('geography')).toBeInTheDocument();
  });

  it('uses the Working badge for working-item cards stored as front/back cards', () => {
    const workingCard: Card = {
      ...mockCard,
      payload: { v: 1, kind: 'working', scheme: [] },
    };
    render(
      <CardList
        cards={[workingCard]}
        context={mockContext}
        onEditCard={vi.fn()}
      />,
    );

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.queryByText('Front / Back')).not.toBeInTheDocument();
  });

  it('shows select mode when Select button is clicked', () => {
    render(
      <CardList
        cards={[mockCard, mockCard2]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    const selectBtn = screen.getByText('Select');
    fireEvent.click(selectBtn);
    expect(screen.getByText('Select all')).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('toggles card selection in select mode', () => {
    render(
      <CardList
        cards={[mockCard, mockCard2]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('expands a card to show analytics', async () => {
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    const cardRow = await screen.findByText('What is the capital of France?');
    fireEvent.click(cardRow);
    const analytics = await screen.findByTestId('card-analytics');
    expect(analytics).toBeInTheDocument();
  });

  it('shows import panel when Import is clicked', () => {
    render(
      <CardList
        cards={[]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    openAddMenu();
    fireEvent.click(screen.getByText('Import cards'));
    expect(screen.getByTestId('import-panel')).toBeInTheDocument();
  });

  it('shows New and Import buttons when not in select mode', () => {
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    // New card is the one primary action in the header; the rest live behind the menu.
    expect(screen.getByText('New card')).toBeInTheDocument();
    expect(screen.queryByText('Import cards')).not.toBeInTheDocument();
    openAddMenu();
    expect(screen.getByText('Import cards')).toBeInTheDocument();
  });

  it('calls onNewCard when New card button is clicked', () => {
    const onNewCard = vi.fn();
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onNewCard={onNewCard}
        onEditCard={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('New card'));
    expect(onNewCard).toHaveBeenCalledOnce();
  });

  it('offers the lesson action for linking existing cards', () => {
    const onLinkExisting = vi.fn();
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onEditCard={vi.fn()}
        onLinkExisting={onLinkExisting}
      />,
    );
    openAddMenu();
    fireEvent.click(screen.getByText('Link existing cards'));
    expect(onLinkExisting).toHaveBeenCalledOnce();
  });

  it('marks linked cards and removes their lesson link instead of deleting the card', async () => {
    const { deleteCards } = await import('../../db/repository');
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

  it('does not show "Assign to lesson…" without assignableLessons/courseId', () => {
    render(
      <CardList
        cards={[mockCard, mockCard2]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Select'));
    expect(screen.queryByText('Assign to lesson…')).not.toBeInTheDocument();
  });

  it('bulk-assigns selected cards to a lesson', async () => {
    const { assignCardsToLesson } = await import('../../db/repository');
    render(
      <CardList
        cards={[mockCard, mockCard2]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
        courseId="course-1"
        assignableLessons={[{ id: 'lesson-1', name: 'Lesson 1' }]}
      />
    );
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Select all'));
    fireEvent.click(screen.getByText('Assign to lesson…'));
    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() =>
      expect(assignCardsToLesson).toHaveBeenCalledWith(['card-1', 'card-2'], 'course-1', 'lesson-1'),
    );
  });

  it('unassigns selected cards when the Unassigned option is chosen', async () => {
    const { assignCardsToLesson } = await import('../../db/repository');
    render(
      <CardList
        cards={[mockCard]}
        context={mockContext}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
        courseId="course-1"
        assignableLessons={[{ id: 'lesson-1', name: 'Lesson 1' }]}
      />
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

    it('badges a generated card and hides its select checkbox and delete action', () => {
      render(
        <CardList
          cards={[mockCard, generatedCard]}
          context={mockContext}
          onNewCard={vi.fn()}
          onEditCard={vi.fn()}
          sequences={[sequence]}
        />,
      );
      expect(screen.getByText('Sequence')).toBeInTheDocument();
      expect(screen.getAllByText('Sequence')).toHaveLength(1);
      expect(screen.getAllByText('Front / Back')).toHaveLength(1);

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
  });
});
