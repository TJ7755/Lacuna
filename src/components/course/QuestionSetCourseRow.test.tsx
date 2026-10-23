import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetPathNode } from '../../course/path';
import { ToastProvider } from '../ui/Toast';
import { QuestionSetCourseRow } from './QuestionSetCourseRow';

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

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderRow(authoring: boolean, activity = node) {
  render(
    <MemoryRouter initialEntries={['/course/course-1']}>
      <Routes>
        <Route
          path="/course/course-1"
          element={
            <ToastProvider>
              <QuestionSetCourseRow node={activity} index={0} authoring={authoring} lessons={[]} />
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
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(false);

    fireEvent.click(screen.getByRole('button', { name: 'Practice questions: Cell structure' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/course/course-1/question-sets/set-1',
    );
  });

  it.each([true, false])('uses morph feedback only in authoring mode (%s)', (authoring) => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(authoring);
    expect(
      screen.getByRole('button', { name: 'Practice questions: Cell structure' }),
    ).toHaveAttribute('data-press', authoring ? 'none' : '');
  });

  it('offers editing only while authoring', () => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(false);
    expect(
      screen.queryByRole('button', { name: 'Question set actions: Practice Qs' }),
    ).not.toBeInTheDocument();
  });

  it('opens the activity editor from Edit while authoring', () => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(true);

    fireEvent.click(screen.getByRole('button', { name: 'Question set actions: Practice Qs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(screen.getByRole('dialog', { name: 'Edit practice questions' })).toBeInTheDocument();
  });

  it('does not launch the first member of a multiple-set activity', () => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(false, { ...node, questionSetIds: ['set-1', 'set-2', 'set-3'] });
    expect(screen.getByRole('button', { name: 'Practice questions: Cell structure' })).toBeDisabled();
    expect(screen.getByText('Multiple-set practice is not yet supported')).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('disables a set that no longer belongs to the course', () => {
    mocks.activityData = { content: undefined, attempt: null, exam: undefined };
    renderRow(false);

    expect(screen.getByRole('button', { name: 'Practice questions: Practice Qs' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});
