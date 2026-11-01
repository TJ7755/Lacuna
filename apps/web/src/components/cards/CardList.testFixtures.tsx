import { vi } from 'vitest';
import { forwardRef } from 'react';
import type { Card, LegacyDeckRecord } from '@lacuna/core/db/types';
import { courseCardListContext } from './cardListContext';
export const mockNotify = vi.fn();
const dataHooks = vi.hoisted(() => ({ useCard: vi.fn() }));

vi.mock('../../state/useData', () => ({
  useCard: dataHooks.useCard,
}));

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

vi.mock('../../db/cardRepository', () => ({
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

// Occlusion thumbnails resolve their diagram from the asset store.
vi.mock('../../db/assetCache', () => ({
  peekCachedAssetUrl: () => undefined,
  cachedAssetImageSize: () => undefined,
  resolveAssetUrl: () => Promise.resolve('blob:diagram'),
}));

vi.mock('@lacuna/core/fsrs/leech', () => ({
  isLeech: vi.fn(() => false),
}));

vi.mock('../ui/icons', () => ({
  CardsIcon: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
  FileTextIcon: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
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
  UploadIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="upload-icon" {...props} />
  ),
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => <div data-testid="markdown-view">{source}</div>,
}));

vi.mock('../ui/Button', () => ({
  // Forwards the accessibility props too: an icon-only trigger has no text to query by,
  // so dropping aria-label here would make it unreachable from a test.
  Button: forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    function MockButton({ children, onClick, disabled, ...rest }, ref) {
      return (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          disabled={disabled}
          data-testid="button"
          {...rest}
        >
          {children}
        </button>
      );
    },
  ),
}));

vi.mock('./CardAnalytics', () => ({
  CardAnalytics: ({ card }: { card: Card }) => (
    <div data-testid="card-analytics">Analytics history: {card.history.length}</div>
  ),
}));
const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Test LegacyDeckRecord',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
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
  lastInteractedAt: Date.now(),
};
export const mockCard: Card = {
  id: 'card-1',
  conceptId: 'concept-card-1',
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
export const mockCard2: Card = {
  ...mockCard,
  id: 'card-2',
  front: 'What is 2 + 2?',
  back: '4',
  tags: ['math'],
};
export const mockContext = courseCardListContext({
  schedulingConfig: mockDeck,
  courseId: 'course-1',
  primaryLessonId: null,
  importTargetName: mockDeck.name,
});
export function resetCardListFixtures() {
  mockNotify.mockClear();
  dataHooks.useCard.mockReset();
  dataHooks.useCard.mockImplementation((id?: string) => (id ? mockCard : null));
}

export { dataHooks };
