import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type { Card, Course, Lesson, Note, PendingMergeReview } from '../../db/types';
import { MergeReviewPanel } from './MergeReviewPanel';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => 0,
}));

const mockNavigate = vi.fn();
const mockAcceptItems = vi.fn().mockResolvedValue(undefined);
const mockRejectItems = vi.fn().mockResolvedValue(undefined);
const mockAcceptAll = vi.fn().mockResolvedValue(undefined);

let mockReview: PendingMergeReview | null | undefined;

const course = {
  id: 'c1',
  name: 'Biology',
  examDate: 2_000_000,
  createdAt: 1,
  distributedCopy: {
    lineageId: 'lin-1',
    revision: 3,
    locked: true,
    autoAcceptUpdates: false,
    sourceLabel: 'Ms Teacher',
  },
} as Course;

const lessons: Lesson[] = [
  {
    id: 'lesson-1',
    courseId: 'c1',
    name: 'Cells',
    orderIndex: 0,
    isExtension: false,
    createdAt: 1,
    updatedAt: 1,
  },
];
const cards = [
  {
    id: 'card-1',
    conceptId: 'concept-card-1',
    courseId: 'c1',
    primaryLessonId: 'lesson-1',
    deckId: 'd1',
    schedulingUnitId: 'lesson-1',
    front: 'Removed card',
    back: '',
    type: 'front_back',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    state: 0,
    stability: null,
    difficulty: null,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    history: [],
  },
  {
    id: 'card-2',
    conceptId: 'concept-card-2',
    courseId: 'c1',
    primaryLessonId: 'lesson-1',
    deckId: 'd1',
    schedulingUnitId: 'lesson-1',
    front: 'Old front',
    back: 'Old back',
    type: 'front_back',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    state: 0,
    stability: null,
    difficulty: null,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    history: [],
  },
] as Card[];
const notes: Note[] = [
  {
    id: 'note-1',
    lessonId: 'lesson-1',
    name: 'Intro',
    content: 'My own notes',
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
  },
];

function fullReview(): PendingMergeReview {
  return {
    id: 'review-1',
    courseId: 'c1',
    lineageId: 'lin-1',
    revision: 3,
    createdAt: 1,
    diff: {
      creates: { lessons: [lessons[0]], notes: [], cards: [] },
      updates: { lessons: [], notes: [], cards: [{ id: 'card-2', front: 'New front' }] },
      removals: { lessonIds: [], noteIds: [], cardIds: ['card-1'] },
      conflicts: [
        {
          entityId: 'note-1',
          kind: 'note',
          incoming: { i: 'note-1', n: 'Intro', c: 'Teacher notes' },
        },
      ],
    },
  };
}

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => notes }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  function TestMemoryRouter(props: React.ComponentProps<typeof actual.MemoryRouter>) {
    return React.createElement(actual.MemoryRouter, {
      ...props,
    });
  }
  return {
    ...actual,
    MemoryRouter: TestMemoryRouter,
    useNavigate: () => mockNavigate,
    useParams: () => ({ courseId: 'c1' }),
  };
});

vi.mock('../../state/useCourseData', () => ({
  useCourse: () => course,
  useLessons: () => lessons,
  useCourseCards: () => cards,
  usePendingMergeReview: () => mockReview,
}));

vi.mock('../../db/mergeImport', () => ({
  acceptMergeReviewItems: (id: string, refs: unknown) => mockAcceptItems(id, refs),
  rejectMergeReviewItems: (id: string, refs: unknown) => mockRejectItems(id, refs),
  acceptAllMergeReview: (id: string) => mockAcceptAll(id),
}));

vi.mock('../markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => <div>{source}</div>,
}));

function renderPanel() {
  return render(
    <MemoryRouter>
      <MergeReviewPanel />
    </MemoryRouter>,
  );
}

describe('MergeReviewPanel', () => {
  it('compares a card without optional tags', () => {
    const tags = cards[1].tags;
    delete cards[1].tags;
    try {
      mockReview!.diff.updates.cards[0].tags = ['Published'];
      renderPanel();
      fireEvent.click(screen.getAllByRole('button', { name: 'Expand detail' })[0]);
      expect(screen.getByText('Tags · Added')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    } finally {
      cards[1].tags = tags;
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockReview = fullReview();
  });

  it('renders the header, auto-applied summary and all outstanding sections', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Biology' })).toBeTruthy();
    expect(screen.getByText('Update from Ms Teacher · revision 3')).toBeTruthy();
    expect(screen.getByText('1 new item was added automatically.')).toBeTruthy();
    expect(screen.getByText('Updates')).toBeTruthy();
    expect(screen.getByText('Removals')).toBeTruthy();
    expect(screen.getByText('Conflicts')).toBeTruthy();
    expect(screen.getByText("You've edited this item.")).toBeTruthy();
  });

  it('accepts a single update with the right reference', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(mockAcceptItems).toHaveBeenCalledWith('review-1', [
      { kind: 'card', entityId: 'card-2' },
    ]);
  });

  it('rejects (keeps) a single removal with the right reference', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(mockRejectItems).toHaveBeenCalledWith('review-1', [
      { kind: 'card', entityId: 'card-1' },
    ]);
  });

  it('keeps the local version on a conflict via the primary action', () => {
    renderPanel();
    const section = screen.getByText('Conflicts').closest('section') as HTMLElement;
    fireEvent.click(within(section).getByRole('button', { name: 'Keep mine' }));
    expect(mockRejectItems).toHaveBeenCalledWith('review-1', [
      { kind: 'note', entityId: 'note-1' },
    ]);
  });

  it('takes the teacher version on a conflict via the secondary action', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Take theirs' }));
    expect(mockAcceptItems).toHaveBeenCalledWith('review-1', [
      { kind: 'note', entityId: 'note-1' },
    ]);
  });

  it('bulk-accepts through the footer', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(mockAcceptAll).toHaveBeenCalledWith('review-1');
  });

  it('shows an empty state and a way back when nothing is pending', () => {
    mockReview = null;
    renderPanel();
    expect(screen.getByText('This course is up to date. There is nothing to review.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to course' })).toBeTruthy();
  });

  it('shows the update before/after preview', () => {
    renderPanel();
    const updatesHeading = screen.getByText('Updates');
    const section = updatesHeading.closest('section') as HTMLElement;
    expect(within(section).getAllByText('Old front').length).toBeGreaterThan(0);
    expect(within(section).getByText('New front')).toBeTruthy();
  });

  it('labels both versions and exposes changed card backs alongside unchanged fronts', () => {
    mockReview!.diff.updates.cards = [{ id: 'card-2', back: '**New back**' }];
    renderPanel();
    const row = screen.getByRole('button', { name: 'Accept' }).closest('li')!;
    expect(within(row).getByText('Current')).toBeInTheDocument();
    expect(within(row).getByText('Incoming')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Expand detail' }));
    expect(within(row).getByText('Front · Unchanged')).toBeInTheDocument();
    expect(within(row).getByText('Back · Changed')).toBeInTheDocument();
    expect(within(row).getByText('**New back**')).toBeInTheDocument();
  });

  it('compares every changed conflict field and labels added and removed content', () => {
    mockReview!.diff.conflicts = [
      {
        kind: 'card',
        entityId: 'card-2',
        incoming: { i: 'card-2', k: 0, f: 'Old front', b: '' },
      },
    ];
    mockReview!.diff.updates.notes = [{ id: 'note-1', name: 'New name', content: '' }];
    mockReview!.diff.updates.lessons = [{ id: 'lesson-1', description: 'New description' }];
    renderPanel();
    for (const button of screen.getAllByRole('button', { name: 'Expand detail' }))
      fireEvent.click(button);
    const conflicts = screen.getByText('Conflicts').closest('section')!;
    expect(within(conflicts).getByText('Back · Removed')).toBeInTheDocument();
    expect(within(conflicts).getByText('Old back')).toBeInTheDocument();
    expect(screen.getByText('Description · Added')).toBeInTheDocument();
    expect(screen.getByText('Name · Changed')).toBeInTheDocument();
    expect(screen.getByText('Content · Removed')).toBeInTheDocument();
  });

  it('moves decision focus to the next row then a completion target, announcing each result', async () => {
    const { rerender } = renderPanel();
    const accept = screen.getByRole('button', { name: 'Accept' });
    accept.focus();
    fireEvent.click(accept);
    await act(async () => {
      await mockAcceptItems.mock.results[0].value;
    });
    mockReview!.diff.updates.cards = [];
    mockReview = { ...mockReview! };
    rerender(
      <MemoryRouter>
        <MergeReviewPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Accepted. 2 changes remaining.');

    const keep = screen.getByRole('button', { name: 'Keep' });
    keep.focus();
    fireEvent.click(keep);
    await act(async () => {
      await mockRejectItems.mock.results[0].value;
    });
    mockReview!.diff.removals.cardIds = [];
    mockReview = { ...mockReview! };
    rerender(
      <MemoryRouter>
        <MergeReviewPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Keep mine' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    await act(async () => {
      await mockRejectItems.mock.results[1].value;
    });
    mockReview = null;
    rerender(
      <MemoryRouter>
        <MergeReviewPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Back to course' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Kept your version. All changes reviewed.',
    );
  });

  it('moves backwards when the last row resolves and leaves deliberately moved focus alone', async () => {
    const { rerender } = renderPanel();
    const take = screen.getByRole('button', { name: 'Take theirs' });
    take.focus();
    fireEvent.click(take);
    await act(async () => {
      await mockAcceptItems.mock.results[0].value;
    });
    mockReview!.diff.conflicts = [];
    mockReview = { ...mockReview! };
    rerender(
      <MemoryRouter>
        <MergeReviewPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
    const remove = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    screen.getByRole('link', { name: 'Back to course' }).focus();
    await act(async () => {
      await mockAcceptItems.mock.results[1].value;
    });
    mockReview!.diff.removals.cardIds = [];
    mockReview = { ...mockReview! };
    rerender(
      <MemoryRouter>
        <MergeReviewPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Back to course' })).toHaveFocus();
  });

  it('keeps failed decisions available for retry and explains the recovery', async () => {
    mockAcceptItems.mockRejectedValueOnce(new Error('Storage full'));
    renderPanel();
    const accept = screen.getByRole('button', { name: 'Accept' });
    accept.focus();
    fireEvent.click(accept);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not apply this decision. Try again.',
      ),
    );
    expect(accept).toHaveFocus();
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    await waitFor(() => expect(mockAcceptItems).toHaveBeenCalledTimes(2));
  });
});
