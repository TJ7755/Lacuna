import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { QuestionSetEvidencePanel } from './QuestionSetEvidencePanel';

function content(): QuestionSetRecord {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Cell paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question-1',
        prompt: 'Explain the cell.',
        parts: [],
        answer: {
          maxMarks: 4,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'knowledge',
              criterion: 'Knowledge',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: ['concept-a', 'concept-b'],
            },
            {
              id: 'application',
              criterion: 'Application',
              maxMarks: 2,
              dimension: 'application',
              targetConceptIds: ['concept-a'],
            },
            {
              id: 'execution',
              criterion: 'Exam execution',
              maxMarks: 1,
              dimension: 'exam-execution',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
    contentVersion: 1,
    contentRevisionId: 'content-revision',
    createdAt: 1,
    updatedAt: 1,
  };
}

function attempt(
  id: string,
  createdAt: number,
  decisions: QuestionSetAttemptRecord['decisions'],
  overrides: Partial<QuestionSetAttemptRecord> = {},
): QuestionSetAttemptRecord {
  const receipt = content();
  return {
    id,
    courseId: receipt.courseId,
    questionSetId: receipt.id,
    receipt,
    mode: 'practice',
    status: 'marking',
    responses: [
      {
        nodeId: 'question-1',
        draft: { kind: 'written', text: 'Original answer' },
        submitted: { kind: 'written', text: 'Original answer' },
        submittedAt: createdAt,
      },
    ],
    decisions,
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    assistance: [],
    revealedQuestionIds: ['question-1'],
    activeNodeId: 'question-1',
    activeAllocationId: 'knowledge',
    revisionId: `${id}-revision`,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('QuestionSetEvidencePanel', () => {
  it('shows unknown coverage without treating absent attempts as failure', () => {
    render(<QuestionSetEvidencePanel content={content()} attempts={[]} />);
    fireEvent.click(screen.getByText('Practice evidence'));
    expect(screen.getByText('No marked evidence yet.')).toBeInTheDocument();
    expect(screen.getByText('2 without submitted evidence')).toBeInTheDocument();
    expect(screen.queryByText('0 / 4')).not.toBeInTheDocument();
  });

  it('shows self-marked totals, unresolved marks, dimensions, and assistance', () => {
    const first = attempt(
      'attempt-1',
      10,
      [
        { allocationId: 'knowledge', status: 'awarded', marks: 0 },
        { allocationId: 'application', status: 'unsure' },
        { allocationId: 'execution', status: 'awarded', marks: 1 },
      ],
      {
        assistance: [{ nodeId: 'question-1', kind: 'related-knowledge', occurredAt: 9 }],
      },
    );
    const repeated = attempt('attempt-2', 20, [
      { allocationId: 'knowledge', status: 'awarded', marks: 1 },
      { allocationId: 'application', status: 'awarded', marks: 2 },
      { allocationId: 'execution', status: 'awarded', marks: 0 },
    ]);

    render(<QuestionSetEvidencePanel content={content()} attempts={[repeated, first]} />);
    fireEvent.click(screen.getByText('Practice evidence'));

    expect(screen.getByText(/self-marked/i)).toBeInTheDocument();
    expect(screen.getByText(/2 attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 assisted/i)).toBeInTheDocument();
    expect(screen.getByText('4 / 6')).toBeInTheDocument();
    const recordedMarks = screen.getByRole('heading', { name: 'Recorded marks' }).parentElement;
    expect(recordedMarks).not.toBeNull();
    expect(within(recordedMarks!).getByText(/2 marks unresolved/i)).toBeInTheDocument();
    expect(screen.getByText('Knowledge')).toBeInTheDocument();
    expect(screen.getByText('Application')).toBeInTheDocument();
    expect(screen.getByText('Exam execution')).toBeInTheDocument();
    expect(screen.queryByText('Mixed')).not.toBeInTheDocument();
  });

  it('filters first-recorded and repeated partitions accessibly', () => {
    const first = attempt('attempt-1', 10, [
      { allocationId: 'knowledge', status: 'awarded', marks: 0 },
      { allocationId: 'application', status: 'unsure' },
      { allocationId: 'execution', status: 'awarded', marks: 1 },
    ]);
    const repeated = attempt('attempt-2', 20, [
      { allocationId: 'knowledge', status: 'awarded', marks: 1 },
      { allocationId: 'application', status: 'awarded', marks: 2 },
      { allocationId: 'execution', status: 'awarded', marks: 0 },
    ]);
    render(<QuestionSetEvidencePanel content={content()} attempts={[repeated, first]} />);
    fireEvent.click(screen.getByText('Practice evidence'));

    const select = screen.getByRole('combobox', { name: 'Attempts' });
    expect(screen.getByRole('option', { name: 'All attempts' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'First recorded' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Repeated' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'first' } });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    const recordedMarks = screen.getByRole('heading', { name: 'Recorded marks' }).parentElement;
    expect(recordedMarks).not.toBeNull();
    expect(within(recordedMarks!).getByText(/2 marks unresolved/i)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'repeated' } });
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.queryByText(/marks unresolved/i)).not.toBeInTheDocument();
  });
});

it('offers marking only for an unfinished attempt in this set', () => {
  const row = attempt('mark-me', 20, []);
  const onResume = vi.fn();
  render(<QuestionSetEvidencePanel content={content()} attempts={[row]} onResume={onResume} />);
  fireEvent.click(screen.getByText('Practice evidence'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue marking' }));
  expect(onResume).toHaveBeenCalledWith(row);
  expect(screen.getAllByText('Not marked yet')).toHaveLength(4);
  expect(screen.queryByText('0 / 4')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Attempts' }), {
    target: { value: 'repeated' },
  });
  expect(screen.queryByRole('button', { name: 'Continue marking' })).not.toBeInTheDocument();
});

it('does not recommend a completed or unrelated attempt', () => {
  const row = attempt('complete', 20, [], { status: 'complete' });
  const unrelated = attempt('other', 30, [], { questionSetId: 'other-set' });
  render(
    <QuestionSetEvidencePanel content={content()} attempts={[row, unrelated]} onResume={vi.fn()} />,
  );
  fireEvent.click(screen.getByText('Practice evidence'));
  expect(screen.queryByRole('button', { name: 'Continue marking' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resume attempt' })).not.toBeInTheDocument();
});
