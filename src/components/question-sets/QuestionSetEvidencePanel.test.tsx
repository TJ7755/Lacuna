import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.queryByRole('heading', { name: 'Recorded marks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Evidence attempts' })).not.toBeInTheDocument();
    expect(screen.queryByText('0 / 4')).not.toBeInTheDocument();
  });

  it('shows resolved totals, unresolved marks and available dimensions inline', () => {
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Self-marked|assisted|Submitted answers only|Coverage records/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2 concepts assessed')).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'First recorded' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repeated' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'First recorded' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    const recordedMarks = screen.getByRole('heading', { name: 'Recorded marks' }).parentElement;
    expect(recordedMarks).not.toBeNull();
    expect(within(recordedMarks!).getByText(/2 marks unresolved/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Repeated' }));
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.queryByText(/marks unresolved/i)).not.toBeInTheDocument();
  });
});

it('shows unresolved marks without recording them as zero and hides filters for one attempt', () => {
  const row = attempt('mark-me', 20, []);
  render(<QuestionSetEvidencePanel content={content()} attempts={[row]} />);
  expect(screen.getAllByText('Not marked yet')).toHaveLength(4);
  expect(screen.getByText('4 marks unresolved')).toBeInTheDocument();
  expect(screen.getByText('0 of 2 concepts assessed')).toBeInTheDocument();
  expect(screen.queryByText('0 / 4')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Evidence attempts' })).not.toBeInTheDocument();
});

it('excludes unrelated sets and courses and hides unlinked concept coverage', () => {
  const set = content();
  set.questions[0].answer!.allocations.forEach((allocation) => {
    allocation.targetConceptIds = [];
  });
  const row = attempt('this-set', 20, [{ allocationId: 'knowledge', status: 'awarded', marks: 1 }]);
  const unrelated = attempt('other', 30, [], { questionSetId: 'other-set' });
  const otherCourse = attempt('other-course', 40, [], { courseId: 'other-course' });
  render(<QuestionSetEvidencePanel content={set} attempts={[row, unrelated, otherCourse]} />);
  expect(screen.getByRole('region', { name: 'Recorded marks' })).toHaveTextContent('1 / 1');
  expect(screen.queryByRole('group', { name: 'Evidence attempts' })).not.toBeInTheDocument();
  expect(screen.queryByText(/concepts assessed/)).not.toBeInTheDocument();
});

it('omits dimensions without submitted marks', () => {
  const set = content();
  set.questions[0].answer!.allocations = [set.questions[0].answer!.allocations[0]];
  const row = attempt(
    'knowledge-only',
    20,
    [{ allocationId: 'knowledge', status: 'awarded', marks: 1 }],
    { receipt: set },
  );
  render(<QuestionSetEvidencePanel content={set} attempts={[row]} />);
  expect(screen.getByText('Knowledge')).toBeInTheDocument();
  expect(screen.queryByText('Application')).not.toBeInTheDocument();
  expect(screen.queryByText('Exam execution')).not.toBeInTheDocument();
  expect(screen.queryByText('Mixed')).not.toBeInTheDocument();
});
