import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { PathNode } from '../../course/path';
import { PathNodeView } from './PathNodeView';

const mocks = vi.hoisted(() => ({ activityData: undefined as unknown }));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => mocks.activityData }));

const node: PathNode = {
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

describe('PathNodeView Question Set activity', () => {
  it('renders a Practice Qs link for the authored activity', () => {
    mocks.activityData = {
      content: {
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
      } satisfies QuestionSetRecord,
      attempt: null,
      exam: undefined,
    };
    render(
      <MemoryRouter>
        <PathNodeView node={node} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Practice Qs Cell structure/ })).toHaveAttribute(
      'href',
      '/course/course-1/question-sets/set-1',
    );
    expect(screen.getByRole('link', { name: /Practice Qs Cell structure/ })).toHaveTextContent(
      'Practice Qs',
    );
    expect(screen.queryByRole('img', { name: 'Unrecognised step' })).not.toBeInTheDocument();
  });

  it('keeps detail hidden until focus, then lets Escape collapse it', () => {
    mocks.activityData = {
      content: {
        id: 'set-1',
        courseId: 'course-1',
        title: 'Cell structure',
        lessonIds: [],
        assessmentIds: ['exam-1'],
        contentVersion: 1,
        contentRevisionId: 'content-1',
        createdAt: 1,
        updatedAt: 1,
        questions: [],
      } satisfies QuestionSetRecord,
      attempt: null,
      exam: { id: 'exam-1', courseId: 'course-1', name: 'Cell exam' },
    };
    render(
      <MemoryRouter>
        <PathNodeView node={node} authoring />
      </MemoryRouter>,
    );

    expect(screen.queryByText('No attempts yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/answered ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cell exam' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit activity' })).not.toBeInTheDocument();

    fireEvent.pointerEnter(screen.getByText('Cell structure'), { pointerType: 'mouse' });
    expect(screen.queryByText('No attempts yet')).not.toBeInTheDocument();

    const activityLink = screen.getByRole('link', { name: /Practice Qs Cell structure/ });
    fireEvent.focus(activityLink);

    expect(screen.getByText('No attempts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cell exam' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit activity' })).toBeInTheDocument();

    fireEvent.keyDown(activityLink, { key: 'Escape' });

    expect(screen.queryByText('No attempts yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cell exam' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit activity' })).not.toBeInTheDocument();
  });
});
