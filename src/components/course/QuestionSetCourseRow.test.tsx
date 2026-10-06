import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetPathNode } from '../../course/path';
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
    questionSetId: 'set-1',
    afterLessonId: 'lesson-1',
    createdAt: 1,
    updatedAt: 1,
  },
  questionSetId: 'set-1',
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

function renderRow(authoring: boolean) {
  render(
    <MemoryRouter initialEntries={['/course/course-1']}>
      <Routes>
        <Route
          path="/course/course-1"
          element={<QuestionSetCourseRow node={node} index={0} authoring={authoring} />}
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

    expect(screen.getByTestId('location')).toHaveTextContent('/course/course-1/question-sets/set-1');
  });

  it('offers editing only while authoring', () => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(false);
    expect(screen.queryByRole('button', { name: 'Edit Cell structure' })).not.toBeInTheDocument();
  });

  it('opens the activity editor from Edit while authoring', () => {
    mocks.activityData = { content, attempt: null, exam: undefined };
    renderRow(true);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Cell structure' }));

    expect(screen.getByRole('dialog', { name: 'Edit practice questions' })).toBeInTheDocument();
  });

  it('disables a set that no longer belongs to the course', () => {
    mocks.activityData = { content: undefined, attempt: null, exam: undefined };
    renderRow(false);

    expect(screen.getByRole('button', { name: 'Practice questions: Practice Qs' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});
