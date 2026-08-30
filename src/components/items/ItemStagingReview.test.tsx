import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Lesson } from '../../db/types';
import type { FixedQuestionDefinition, QuestionDefinition } from '../../questions/types';
import { BATCH_OUTPUT_END, BATCH_OUTPUT_START } from '../../items/prompts';
import { ItemStagingReview } from './ItemStagingReview';

const createBatchFixedQuestion = vi.fn().mockResolvedValue({
  question: { id: 'created-question' },
});
const notify = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock('../../items/batchQuestionImport', () => ({
  createBatchFixedQuestion: (...args: unknown[]) => createBatchFixedQuestion(...args),
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
  updatedAt: 1,
  isExtension: false,
};

function existingQuestion(prompt: string): FixedQuestionDefinition {
  return {
    id: 'existing-question',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    additionalLessonIds: [],
    name: 'Existing Question',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt,
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    explanation: 'Worked explanation.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'content-revision-1',
    authoringRevisionId: 'authoring-revision-1',
    authoringUpdatedAt: 1,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    scheduleEpoch: { id: 'epoch-1', startedAt: 1, reason: 'created', baseline: { kind: 'new' } },
    scheduleUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function batch(items: unknown[]): string {
  const complete = items.map((item, index) => ({
    explanation: `Worked explanation ${index + 1}`,
    targetConcept: `Target Concept ${index + 1}`,
    prerequisiteConcepts: [],
    ...(typeof item === 'object' && item !== null ? item : {}),
  }));
  return `${BATCH_OUTPUT_START}\n${JSON.stringify({ version: 2, items: complete })}\n${BATCH_OUTPUT_END}`;
}

function stage(source: string, questions: QuestionDefinition[] = []) {
  render(<ItemStagingReview courseId="course-1" lessons={[lesson]} questions={questions} />);
  fireEvent.change(screen.getByPlaceholderText(new RegExp(BATCH_OUTPUT_START)), {
    target: { value: source },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review batch' }));
}

beforeEach(() => {
  createBatchFixedQuestion.mockClear();
  notify.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
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
      [existingQuestion('Existing question')],
    );

    expect(screen.getByText(/Scheme line 1/)).toBeInTheDocument();
    const duplicateRow = screen.getByText('Existing question').closest('article')!;
    expect(within(duplicateRow).getByText('Likely duplicate')).toBeInTheDocument();
    expect(within(duplicateRow).getByRole('button', { name: 'Accept' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept all clean' }));
    await waitFor(() => expect(createBatchFixedQuestion).toHaveBeenCalledTimes(2));
    expect(createBatchFixedQuestion.mock.calls.map((call) => call[0].prompt)).toEqual([
      'Fresh numeric',
      'Fresh working',
    ]);

    fireEvent.click(within(duplicateRow).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(createBatchFixedQuestion).toHaveBeenCalledTimes(3));
    expect(within(duplicateRow).getByText('accepted')).toBeInTheDocument();
    expect(
      within(duplicateRow).queryByRole('button', { name: 'Revise with AI' }),
    ).not.toBeInTheDocument();
  });

  it('reports fixtures as unavailable rather than failing when the scheme will not compile', () => {
    stage(
      batch([
        {
          kind: 'working',
          question: 'Broken scheme',
          scheme: 'no marks',
          fixtures: [{ studentAnswer: ['4'], expectedMarks: 1 }],
        },
      ]),
    );
    const row = screen.getByText('Broken scheme').closest('article')!;

    expect(within(row).getByText('Fixtures unavailable')).toBeInTheDocument();
    expect(within(row).queryByText(/fixtures pass/)).not.toBeInTheDocument();
    expect(within(row).getByText(/Scheme line 1/)).toBeInTheDocument();
  });

  it('revalidates an edited malformed item and supports rejection', () => {
    stage(batch([{ kind: 'numeric', question: '', answer: { kind: 'exact', value: '4' } }]));
    const row = screen.getByText('Untitled Question').closest('article')!;

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(within(row).getByRole('textbox', { name: 'Question' })).toHaveFocus();
    fireEvent.change(within(row).getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Corrected' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Apply edit' }));
    expect(screen.getByText('Corrected')).toBeInTheDocument();

    const correctedRow = screen.getByText('Corrected').closest('article')!;
    fireEvent.click(within(correctedRow).getByRole('button', { name: 'Reject' }));
    expect(within(correctedRow).getByText('rejected')).toBeInTheDocument();
    expect(within(correctedRow).getByRole('button', { name: 'Restore' })).toHaveFocus();
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

  it('copies a scoped revision prompt with the failing fixture and complaint', async () => {
    stage(
      batch([
        {
          kind: 'working',
          question: 'Calculate revenue',
          scheme: '[1] revenue :: equals :: 1120',
          fixtures: [{ studentAnswer: ['1000'], expectedMarks: 1 }],
        },
      ]),
    );
    const row = screen.getByText('Calculate revenue').closest('article')!;

    fireEvent.click(within(row).getByRole('button', { name: 'Revise with AI' }));
    expect(within(row).getByRole('textbox', { name: 'What should change?' })).toHaveFocus();
    fireEvent.change(within(row).getByRole('textbox', { name: 'What should change?' }), {
      target: { value: 'Accept the correct intermediate quantity.' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Copy revision prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('Calculate revenue');
    expect(prompt).toContain('[1] revenue :: equals :: 1120');
    expect(prompt).toContain('"studentAnswer": [');
    expect(prompt).toContain('Accept the correct intermediate quantity.');
    expect(notify).toHaveBeenCalledWith('Revision prompt copied to the clipboard.', 'positive');
  });
  it('applies a pasted revision to one item without disturbing its neighbours', async () => {
    stage(
      batch([
        {
          kind: 'working',
          question: 'Broken fixture',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['5'], expectedMarks: 1 }],
        },
        { kind: 'numeric', question: 'Untouched neighbour', answer: { kind: 'exact', value: '2' } },
      ]),
    );
    const row = screen.getByText('Broken fixture').closest('article')!;
    expect(within(row).getByText(/expected 1 marks but received 0/)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Revise with AI' }));
    fireEvent.change(within(row).getByRole('textbox', { name: 'Revised reply' }), {
      target: {
        value: JSON.stringify({
          kind: 'working',
          question: 'Repaired fixture',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['4'], expectedMarks: 1 }],
        }),
      },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Apply revision' }));

    await waitFor(() => expect(screen.getByText('Repaired fixture')).toBeInTheDocument());
    expect(screen.queryByText(/expected 1 marks but received 0/)).not.toBeInTheDocument();
    expect(screen.getByText('Untouched neighbour')).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith('Revised item applied.', 'positive');
  });

  it('merges a batch revision over the failing items in order', async () => {
    stage(
      batch([
        {
          kind: 'working',
          question: 'First broken',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['5'], expectedMarks: 1 }],
        },
        { kind: 'numeric', question: 'Already clean', answer: { kind: 'exact', value: '9' } },
        { kind: 'numeric', question: 'Second broken', answer: { kind: 'exact', value: 'x + 1' } },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revise 2 with AI' }));
    expect(
      screen.getByRole('textbox', { name: 'Anything else to change? (optional)' }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Copy revision prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('--- Item 1 of 2 ---');
    expect(prompt).toContain('First broken');
    expect(prompt).toContain('Second broken');
    expect(prompt).not.toContain('Already clean');

    fireEvent.change(screen.getByRole('textbox', { name: 'Revised reply' }), {
      target: {
        value: batch([
          {
            kind: 'working',
            question: 'First repaired',
            scheme: '[1] answer :: equals :: 4',
            fixtures: [{ studentAnswer: ['4'], expectedMarks: 1 }],
          },
          { kind: 'numeric', question: 'Second repaired', answer: { kind: 'exact', value: '7' } },
        ]),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply revisions' }));

    await waitFor(() => expect(screen.getByText('First repaired')).toBeInTheDocument());
    expect(screen.getByText('Second repaired')).toBeInTheDocument();
    expect(screen.getByText('Already clean')).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith('Applied 2 revised items.', 'positive');
  });

  it('applies nothing when the revision count does not match', async () => {
    stage(
      batch([
        { kind: 'numeric', question: 'Broken one', answer: { kind: 'exact', value: 'x' } },
        { kind: 'numeric', question: 'Broken two', answer: { kind: 'exact', value: 'y' } },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revise 2 with AI' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Revised reply' }), {
      target: {
        value: batch([
          { kind: 'numeric', question: 'Only one back', answer: { kind: 'exact', value: '3' } },
        ]),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply revisions' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'The response has 1 item but 2 needed revision.',
        'negative',
      ),
    );
    expect(screen.getByText('Broken one')).toBeInTheDocument();
    expect(screen.getByText('Broken two')).toBeInTheDocument();
    expect(screen.queryByText('Only one back')).not.toBeInTheDocument();
  });
});
