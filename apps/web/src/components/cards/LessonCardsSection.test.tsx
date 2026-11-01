import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LessonCardsSection } from './LessonCardsSection';
import type { Card, LegacyDeckRecord, LessonCardLink } from '@lacuna/core/db/types';

let mockLinks: LessonCardLink[] | undefined = [];
const mockUnlink = vi.fn();
const mockGetExposure = vi.fn();
const mockNotify = vi.fn();
const observedContexts: {
  importTargetName: string;
  hasImport: boolean;
  hasApkg: boolean;
  hasRestore: boolean;
}[] = [];

vi.mock('../../state/useCourseData', () => ({
  useLessonCardLinks: () => mockLinks,
  useSequences: () => [],
  useOcclusions: () => [],
}));

vi.mock('../../db/schema', () => ({
  db: {
    lessonCards: { where: vi.fn() },
    lessonCardExposures: { get: (...args: unknown[]) => mockGetExposure(...args) },
  },
}));

vi.mock('../../db/cardRepository', () => ({
  restoreCards: vi.fn(),
}));
vi.mock('../../db/lessonRepository', () => ({
  unlinkCardFromLesson: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock('./AnswerModeControl', () => ({
  LessonAnswerModeControl: () => <p>Answer by</p>,
}));
vi.mock('./CardList', () => ({
  CardList: ({
    linkedCardIds,
    onUnlinkCard,
    context,
    heading,
    beforeCards,
  }: {
    heading?: ReactNode;
    beforeCards?: ReactNode;
    linkedCardIds?: ReadonlySet<string>;
    onUnlinkCard?: (card: Card) => void;
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
        {heading}
        {beforeCards}
        <span data-testid="linked-ids">{[...(linkedCardIds ?? [])].join(',')}</span>
        <button type="button" onClick={() => onUnlinkCard?.(card)}>
          Remove linked card
        </button>
      </div>
    );
  },
}));

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
  conceptId: 'concept-card-1',
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
  updatedAt: 1,
  tags: [],
  suspended: false,
  buriedUntil: null,
  courseId: 'course-1',
  primaryLessonId: 'lesson-2',
};

beforeEach(() => {
  mockLinks = [];
  mockUnlink.mockReset();
  mockNotify.mockReset();
  observedContexts.length = 0;
  mockUnlink.mockResolvedValue(undefined);
  mockGetExposure.mockReset();
  mockGetExposure.mockResolvedValue(undefined);
});

describe('LessonCardsSection', () => {
  it('leaves an empty lesson to its New card, with nothing to manage', () => {
    const { container, rerender } = render(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[]}
        lessonSchedulingConfig={undefined}
        onNavigate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <LessonCardsSection
        courseId="course-1"
        lessonId="lesson-1"
        lessonName="Cells"
        lessonCards={[card]}
        lessonSchedulingConfig={deck}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Manage (1)' })).toBeInTheDocument();
    expect(screen.getByText('Answer by')).toBeInTheDocument();
    // Every way to add cards starts from the card panel's New card; Manage only manages.
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('identifies linked membership in a populated lesson', () => {
    mockLinks = [
      { id: 'link-1', lessonId: 'lesson-1', cardId: card.id, createdAt: 1, updatedAt: 1 },
    ];
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
  });

  it('warns before unlinking a card with lesson-specific teaching progress', async () => {
    mockLinks = [
      { id: 'link-1', lessonId: 'lesson-1', cardId: card.id, createdAt: 1, updatedAt: 1 },
    ];
    mockGetExposure.mockResolvedValue({
      lessonId: 'lesson-1',
      cardId: card.id,
      taughtAt: 1,
      updatedAt: 1,
    });
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
    await waitFor(() =>
      expect(screen.getByText('Remove card from this lesson?')).toBeInTheDocument(),
    );
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
});
