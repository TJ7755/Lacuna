import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import type { QuestionSetPathNode } from '../../course/path';
import { ToastProvider } from '../ui/Toast';
import { QuestionSetCourseRow } from './QuestionSetCourseRow';
import type { LessonReorderInteraction } from './useLessonPathReorder';

const mocks = vi.hoisted(() => ({ activityData: undefined as unknown }));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => mocks.activityData }));
vi.mock('./QuestionSetPathEditor', () => ({
  QuestionSetPathEditor: () => <div role="dialog" aria-label="Edit practice questions" />,
}));

const node: QuestionSetPathNode = {
  id: 'activity-1',
  nodeType: 'practice-question-set',
  practiceNode: {
    id: 'activity-1',
    courseId: 'course-1',
    type: 'question-set',
    name: 'Practice Qs',
    questionSetIds: ['set-1'],
    afterLessonId: 'lesson-1',
    createdAt: 1,
    updatedAt: 1,
  },
  questionSetIds: ['set-1'],
  afterLessonId: 'lesson-1',
  nodeKey: 'activity-1',
};

const content: QuestionSetRecord = {
  id: 'set-1',
  courseId: 'course-1',
  title: 'Cell structure',
  lessonIds: [],
  assessmentIds: [],
  contentVersion: 1,
  contentRevisionId: 'content-1',
  createdAt: 1,
  updatedAt: 1,
  questions: [],
};

const secondSet: QuestionSetRecord = {
  ...content,
  id: 'set-2',
  title: 'Ecology',
  contentRevisionId: 'content-2',
};

const completedAttempt: QuestionSetAttemptRecord = {
  id: 'attempt-1',
  courseId: 'course-1',
  questionSetId: 'set-1',
  receipt: {
    ...content,
    questions: [
      {
        id: 'question-1',
        prompt: 'Name one structure.',
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Names the structure',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
        parts: [],
      },
    ],
  },
  mode: 'practice',
  status: 'complete',
  responses: [
    {
      nodeId: 'question-1',
      draft: { kind: 'written', text: 'A structure' },
      submitted: { kind: 'written', text: 'A structure' },
      submittedAt: 2,
    },
  ],
  decisions: [{ allocationId: 'allocation-1', status: 'awarded', marks: 1 }],
  annotations: [],
  corrections: [],
  reflection: { reasons: [], note: '' },
  assistance: [],
  revealedQuestionIds: ['question-1'],
  activeNodeId: 'question-1',
  activeAllocationId: null,
  revisionId: 'revision-1',
  createdAt: 1,
  updatedAt: 2,
  completedAt: 2,
};

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderRow(authoring: boolean, activity = node, reorder?: LessonReorderInteraction) {
  render(
    <MemoryRouter initialEntries={['/course/course-1']}>
      <Routes>
        <Route
          path="/course/course-1"
          element={
            <ToastProvider>
              <QuestionSetCourseRow
                node={activity}
                index={0}
                authoring={authoring}
                lessons={[]}
                reorder={reorder}
              />
            </ToastProvider>
          }
        />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuestionSetCourseRow', () => {
  it('names the set and opens it directly', () => {
    mocks.activityData = [{ id: 'set-1', content, attempt: null, exam: undefined }];
    renderRow(false);

    fireEvent.click(screen.getByRole('button', { name: 'Practice questions: Cell structure' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/course/course-1/question-sets/set-1',
    );
  });

  it.each([true, false])('uses morph feedback only in authoring mode (%s)', (authoring) => {
    mocks.activityData = [{ id: 'set-1', content, attempt: null, exam: undefined }];
    renderRow(authoring);
    expect(
      screen.getByRole('button', { name: 'Practice questions: Cell structure' }),
    ).toHaveAttribute('data-press', authoring ? 'none' : '');
  });

  it('offers editing only while authoring', () => {
    mocks.activityData = [{ id: 'set-1', content, attempt: null, exam: undefined }];
    renderRow(false);
    expect(
      screen.queryByRole('button', { name: 'Question set actions: Practice Qs' }),
    ).not.toBeInTheDocument();
  });

  it('opens the activity editor from Edit while authoring', () => {
    mocks.activityData = [{ id: 'set-1', content, attempt: null, exam: undefined }];
    renderRow(true);

    fireEvent.click(screen.getByRole('button', { name: 'Question set actions: Practice Qs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(screen.getByRole('dialog', { name: 'Edit practice questions' })).toBeInTheDocument();
  });

  it('opens every member of a multiple-set activity with its own progress', () => {
    mocks.activityData = [
      { id: 'set-1', content, attempt: completedAttempt, exam: undefined },
      { id: 'set-2', content: secondSet, attempt: null, exam: undefined },
    ];
    renderRow(false, { ...node, questionSetIds: ['set-1', 'set-2'] });

    const completed = screen.getByRole('button', { name: 'Practice questions: Cell structure' });
    const added = screen.getByRole('button', { name: 'Practice questions: Ecology' });
    expect(completed).toBeEnabled();
    expect(added).toBeEnabled();
    expect(completed).toHaveTextContent('1/1 answered');
    expect(added).toHaveTextContent('Practice questions');

    fireEvent.click(added);
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/course/course-1/question-sets/set-2',
    );
  });

  it('disables a set that no longer belongs to the course', () => {
    mocks.activityData = [{ id: 'set-1', content: undefined, attempt: null, exam: undefined }];
    renderRow(false);

    expect(screen.getByRole('button', { name: 'Practice questions: Practice Qs' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('shows added parts as new work alongside the preserved historical progress', () => {
    const original = completedAttempt.receipt.questions[0];
    mocks.activityData = [
      {
        id: content.id,
        content: { ...content, questions: [original, { ...original, id: 'question-new' }] },
        attempt: completedAttempt,
        exam: undefined,
      },
    ];
    renderRow(false);

    const row = screen.getByRole('button', { name: 'Practice questions: Cell structure' });
    expect(row).toHaveTextContent('1/1 answered · 1 new part');
    expect(row.querySelector('.origin-left')).toHaveStyle({ width: '50%' });
    fireEvent.click(row);
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/course/course-1/question-sets/set-1',
    );
  });

  it('keeps one working authoring control for a multiple-set activity', () => {
    mocks.activityData = [
      { id: 'set-1', content, attempt: completedAttempt, exam: undefined },
      { id: 'set-2', content: secondSet, attempt: null, exam: undefined },
    ];
    const reorder: LessonReorderInteraction = {
      enabled: true,
      lifted: false,
      dropMarker: undefined,
      registerElement: vi.fn(),
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onPointerCancel: vi.fn(),
      onClickCapture: vi.fn(),
      onKeyDown: vi.fn(),
    };
    renderRow(true, { ...node, questionSetIds: ['set-1', 'set-2'] }, reorder);

    const row = screen.getByRole('button', { name: 'Practice questions: Practice Qs' });
    expect(screen.getAllByRole('button', { name: /^Practice questions:/ })).toHaveLength(1);
    expect(row).toHaveTextContent('2 question sets');
    expect(row).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    expect(reorder.registerElement).toHaveBeenCalledWith(row);
    fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true });
    expect(reorder.onKeyDown).toHaveBeenCalledOnce();
    fireEvent.pointerDown(row);
    expect(reorder.onPointerDown).toHaveBeenCalledOnce();
    fireEvent.click(row);
    expect(screen.getByRole('dialog', { name: 'Edit practice questions' })).toBeInTheDocument();
  });
});
