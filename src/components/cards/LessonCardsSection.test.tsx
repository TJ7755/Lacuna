import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LessonCardsSection } from './LessonCardsSection';
import type { Card, LegacyDeckRecord, LessonCardLink } from '../../db/types';

let mockLinks: LessonCardLink[] | undefined = [];
let mockCourseCards: Card[] = [];
let mockPreparedDeck: LegacyDeckRecord | undefined;
const mockUnlink = vi.fn();
const mockEnsureLessonBackingDeck = vi.fn();
const mockGetExposure = vi.fn();
const mockNotify = vi.fn();
const observedContexts: { importTargetName: string; hasImport: boolean; hasApkg: boolean; hasRestore: boolean }[] = [];

vi.mock('../../state/useCourseData', () => ({
  useCourseCards: () => mockCourseCards,
  useLessonBackingDeck: () => mockPreparedDeck,
  useLessonCardLinks: () => mockLinks,
  useLessons: () => [lesson],
  useSequences: () => [],
  useOcclusions: () => [],
}));

vi.mock('../../db/backingDecks', () => ({
  ensureLessonBackingDeck: (...args: unknown[]) => mockEnsureLessonBackingDeck(...args),
}));

vi.mock('../../db/schema', () => ({
  db: {
    lessonCards: { where: vi.fn() },
    lessonCardExposures: { get: (...args: unknown[]) => mockGetExposure(...args) },
  },
}));

vi.mock('../../db/repository', () => ({
  restoreCards: vi.fn(),
  unlinkCardFromLesson: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock('./LinkCardsDialog', () => ({
  LinkCardsDialog: ({ cards }: { cards: Card[] }) => (
    <div role="dialog">
      Card picker
      <span data-testid="picker-card-ids">{cards.map((card) => card.id).join(',')}</span>
    </div>
  ),
}));

vi.mock('./CardList', () => ({
  CardList: ({
    initiallyImporting,
    onLinkExisting,
    linkedCardIds,
    onUnlinkCard,
    context,
  }: {
    onLinkExisting?: () => void;
    linkedCardIds?: ReadonlySet<string>;
    onUnlinkCard?: (card: Card) => void;
    initiallyImporting?: boolean;
    context?: {
      importTargetName: string;
      onImport: unknown;
      onApkgImport: unknown;
      onRestore: unknown;
    };
  }) => {
    if (context) {
      observedContexts.push({
        importTargetName: context.importTargetName,
        hasImport: typeof context.onImport === 'function',
        hasApkg: typeof context.onApkgImport === 'function',
        hasRestore: typeof context.onRestore === 'function',
      });
    }
    return (
    <div>
      {initiallyImporting && <span data-testid="initially-importing">true</span>}
      <button type="button" onClick={onLinkExisting}>Open linked-card picker</button>
      <span data-testid="linked-ids">{[...(linkedCardIds ?? [])].join(',')}</span>
      <button type="button" onClick={() => onUnlinkCard?.(card)}>Remove linked card</button>
    </div>
    );
  },
}));

const lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Cells',
  description: '',
  orderIndex: 0,
  createdAt: 1,
  isExtension: false,
};

const deck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Cells',
  examDate: Date.now(),
  timeZone: 'UTC',
  createdAt: 1,
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  lastInteractedAt: 1,
};

const card: Card = {
  id: 'card-1',
  deckId: deck.id,
  schedulingUnitId: deck.id,
  type: 'front_back',
  front: 'Cell membrane',
  back: 'Controls entry',
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
  primaryLessonId: 'lesson-2',
};

beforeEach(() => {
  mockLinks = [];
  mockCourseCards = [card];
  mockPreparedDeck = undefined;
  mockUnlink.mockReset();
  mockEnsureLessonBackingDeck.mockReset();
  mockNotify.mockReset();
  observedContexts.length = 0;
  mockUnlink.mockResolvedValue(undefined);
  mockGetExposure.mockReset();
  mockGetExposure.mockResolvedValue(undefined);
  mockEnsureLessonBackingDeck.mockResolvedValue(deck.id);
});

describe('LessonCardsSection', () => {
  it('prepares and opens the importer for an empty lesson', async () => {
    mockPreparedDeck = deck;
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Import cards'));
    await waitFor(() => expect(mockEnsureLessonBackingDeck).toHaveBeenCalledWith('course-1', 'lesson-1'));
    expect(screen.getByTestId('initially-importing')).toHaveTextContent('true');
    expect(observedContexts).toEqual([
      { importTargetName: 'Cells', hasImport: true, hasApkg: true, hasRestore: true },
    ]);
  });

  it('notifies when preparing an empty import fails', async () => {
    mockEnsureLessonBackingDeck.mockRejectedValue(new Error('Could not prepare import.'));
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Import cards'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Could not prepare import.', 'negative'));
    expect(screen.queryByTestId('initially-importing')).not.toBeInTheDocument();
  });

  it('opens the existing-card picker from an empty lesson', () => {
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Link existing cards'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Card picker');
  });

  it('opens the picker from a populated lesson and identifies linked membership', () => {
    mockLinks = [{ id: 'link-1', lessonId: 'lesson-1', cardId: card.id, createdAt: 1 }];
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[card]}
        lessonSchedulingConfig={deck}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('linked-ids')).toHaveTextContent(card.id);
    expect(observedContexts).toEqual([
      { importTargetName: 'Cells', hasImport: true, hasApkg: true, hasRestore: true },
    ]);
    fireEvent.click(screen.getByText('Open linked-card picker'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Card picker');
  });

  it('warns before unlinking a card with lesson-specific teaching progress', async () => {
    mockLinks = [{ id: 'link-1', lessonId: 'lesson-1', cardId: card.id, createdAt: 1 }];
    mockGetExposure.mockResolvedValue({ lessonId: 'lesson-1', cardId: card.id, taughtAt: 1 });
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[card]}
        lessonSchedulingConfig={deck}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Remove linked card'));
    await waitFor(() => expect(screen.getByText('Remove card from this lesson?')).toBeInTheDocument());
    expect(mockUnlink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(mockUnlink).toHaveBeenCalledOnce());
  });

  it('withholds card controls until linked membership has loaded', () => {
    mockLinks = undefined;
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[card]}
        lessonSchedulingConfig={deck}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Loading lesson cards')).toBeInTheDocument();
    expect(screen.queryByText('Remove linked card')).not.toBeInTheDocument();
  });

  it('excludes generated sequence cards from linking candidates', () => {
    mockCourseCards = [
      card,
      { ...card, id: 'generated-card', sequenceItemId: 'sequence-item-1' },
    ];
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Link existing cards'));
    expect(screen.getByTestId('picker-card-ids')).toHaveTextContent(card.id);
    expect(screen.getByTestId('picker-card-ids')).not.toHaveTextContent('generated-card');
  });

  it('excludes generated occlusion cards from linking candidates', () => {
    mockCourseCards = [
      card,
      { ...card, id: 'generated-card', occlusionRegionId: 'region-1' },
    ];
    render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Link existing cards'));
    expect(screen.getByTestId('picker-card-ids')).toHaveTextContent(card.id);
    expect(screen.getByTestId('picker-card-ids')).not.toHaveTextContent('generated-card');
  });
});
