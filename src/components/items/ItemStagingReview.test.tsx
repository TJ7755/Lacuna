import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Card, Lesson } from '../../db/types';
import { BATCH_OUTPUT_END, BATCH_OUTPUT_START } from '../../items/prompts';
import { ItemStagingReview } from './ItemStagingReview';

const createLessonCard = vi.fn().mockResolvedValue({ id: 'created-card' });
const notify = vi.fn();

vi.mock('../../db/repository', () => ({
  createLessonCard: (...args: unknown[]) => createLessonCard(...args),
  normaliseCardText: (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' '),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Algebra',
  description: '',
  orderIndex: 0,
  createdAt: 1,
  isExtension: false,
};

function existingCard(front: string): Card {
  return {
    id: 'existing-card',
    deckId: 'deck-1',
    type: 'front_back',
    front,
    back: '',
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
    primaryLessonId: 'lesson-1',
  };
}

function batch(items: unknown[]): string {
  return `${BATCH_OUTPUT_START}\n${JSON.stringify({ version: 1, items })}\n${BATCH_OUTPUT_END}`;
}

function stage(source: string, cards: Card[] = []) {
  render(<ItemStagingReview courseId="course-1" lessons={[lesson]} cards={cards} />);
  fireEvent.change(screen.getByPlaceholderText(new RegExp(BATCH_OUTPUT_START)), {
    target: { value: source },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review batch' }));
}

beforeEach(() => {
  createLessonCard.mockClear();
  notify.mockClear();
});

describe('ItemStagingReview', () => {
  it('flags one malformed item, bulk-imports clean items and leaves duplicates overridable', async () => {
    stage(
      batch([
        { kind: 'working', question: 'Malformed', scheme: 'no marks', fixtures: [] },
        { kind: 'numeric', question: 'Fresh numeric', answer: { kind: 'exact', value: '4' } },
        {
          kind: 'working',
          question: 'Fresh working',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['4'], expectedMarks: 1 }],
        },
        { kind: 'numeric', question: 'Existing question', answer: { kind: 'exact', value: '2' } },
      ]),
      [existingCard('Existing question')],
    );

    expect(screen.getByText(/Scheme line 1/)).toBeInTheDocument();
    const duplicateRow = screen.getByText('Existing question').closest('article')!;
    expect(within(duplicateRow).getByText('Likely duplicate')).toBeInTheDocument();
    expect(within(duplicateRow).getByRole('button', { name: 'Accept' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept all clean' }));
    await waitFor(() => expect(createLessonCard).toHaveBeenCalledTimes(2));
    expect(createLessonCard.mock.calls.map((call) => call[3])).toEqual([
      'Fresh numeric',
      'Fresh working',
    ]);

    fireEvent.click(within(duplicateRow).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(createLessonCard).toHaveBeenCalledTimes(3));
  });

  it('revalidates an edited malformed item and supports rejection', () => {
    stage(batch([{ kind: 'numeric', question: '', answer: { kind: 'exact', value: '4' } }]));
    const row = screen.getByText('Untitled item').closest('article')!;

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(row).getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Corrected' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Apply edit' }));
    expect(screen.getByText('Corrected')).toBeInTheDocument();

    const correctedRow = screen.getByText('Corrected').closest('article')!;
    fireEvent.click(within(correctedRow).getByRole('button', { name: 'Reject' }));
    expect(within(correctedRow).getByText('rejected')).toBeInTheDocument();
    expect(within(correctedRow).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('edits a working fixture through fields rather than raw JSON', () => {
    stage(
      batch([
        {
          kind: 'working',
          question: 'Calculate the result',
          scheme: '[1] result :: equals :: 4',
          fixtures: [{ studentAnswer: ['4'], expectedMarks: 2 }],
        },
      ]),
    );
    const row = screen.getByText('Calculate the result').closest('article')!;
    expect(
      within(row).getByText('Fixture 1 expects 2 marks, but the scheme has 1 available.'),
    ).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(within(row).queryByText('Item JSON')).not.toBeInTheDocument();
    fireEvent.change(within(row).getByRole('spinbutton', { name: 'Expected marks' }), {
      target: { value: '1' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Apply edit' }));

    expect(within(row).getByText('Valid')).toBeInTheDocument();
    expect(within(row).getByText('1 of 1 fixtures pass')).toBeInTheDocument();
  });
});
