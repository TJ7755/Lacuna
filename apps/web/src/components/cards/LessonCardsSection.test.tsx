import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { LessonCardsSection } from './LessonCardsSection';
import type { Card, LegacyDeckRecord } from '@lacuna/core/db/types';
import type * as CardRepository from '../../db/cardRepository';

let linkedCardIds = new Set<string>();
const mockUnlink = vi.fn();
const mockGetExposure = vi.fn();
const mockNotify = vi.fn();
const observedContexts: {
  importTargetName: string;
  hasImport: boolean;
  hasApkg: boolean;
  hasRestore: boolean;
}[] = [];

vi.mock('../../db/schema', () => ({
  db: {
    lessonCards: { where: vi.fn() },
    lessonCardExposures: { get: (...args: unknown[]) => mockGetExposure(...args) },
  },
}));

vi.mock('../../db/cardRepository', async (original) => ({
  ...(await original<typeof CardRepository>()),
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
  linkedCardIds = new Set();
  mockUnlink.mockReset();
  mockNotify.mockReset();
  observedContexts.length = 0;
  mockUnlink.mockResolvedValue(undefined);
  mockGetExposure.mockReset();
  mockGetExposure.mockResolvedValue(undefined);
});

describe('LessonCardsSection', () => {
  it('identifies linked membership in a populated lesson', () => {
    linkedCardIds = new Set([card.id]);
    render(
      <LazyMotion features={domAnimation}>
        <MemoryRouter>
          <LessonCardsSection
            courseId="course-1"
            lessonId="lesson-1"
            lessonName="Cells"
            lessonCards={[card]}
            lessonSchedulingConfig={deck}
            linkedCardIds={linkedCardIds}
            renderCards={() => null}
          />
        </MemoryRouter>
      </LazyMotion>,
    );
    expect(screen.getByTestId('linked-ids')).toHaveTextContent(card.id);
    expect(observedContexts).toEqual([
      { importTargetName: 'Cells', hasImport: true, hasApkg: true, hasRestore: true },
    ]);
  });

  it('warns before unlinking a card with lesson-specific teaching progress', async () => {
    linkedCardIds = new Set([card.id]);
    mockGetExposure.mockResolvedValue({
      lessonId: 'lesson-1',
      cardId: card.id,
      taughtAt: 1,
      updatedAt: 1,
    });
    render(
      <LazyMotion features={domAnimation}>
        <MemoryRouter>
          <LessonCardsSection
            courseId="course-1"
            lessonId="lesson-1"
            lessonName="Cells"
            lessonCards={[card]}
            lessonSchedulingConfig={deck}
            linkedCardIds={linkedCardIds}
            renderCards={() => null}
          />
        </MemoryRouter>
      </LazyMotion>,
    );

    fireEvent.click(screen.getByText('Remove linked card'));
    await waitFor(() =>
      expect(screen.getByText('Remove card from this lesson?')).toBeInTheDocument(),
    );
    expect(mockUnlink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(mockUnlink).toHaveBeenCalledOnce());
  });
});
