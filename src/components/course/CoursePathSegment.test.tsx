import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CourseAssessment, Lesson, PracticeNode } from '../../db/types';
import type { PathNode, PracticePathNode } from '../../course/path';
import { PathNodeWithLine } from './CoursePathSegment';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Kinematics',
  orderIndex: 0,
  createdAt: 0,
  updatedAt: 0,
  isExtension: false,
};

const lessonNode: PathNode = {
  id: 'lesson-1',
  nodeType: 'lesson',
  lesson,
  status: 'available',
};

const practiceRecord: PracticeNode = {
  id: 'practice-1',
  courseId: 'course-1',
  type: 'manual',
  name: 'Weekly review',
  position: 0,
  createdAt: 0,
  updatedAt: 0,
};

const practiceNode: PracticePathNode = {
  id: 'practice-1',
  nodeType: 'practice-manual',
  practiceNode: practiceRecord,
  afterLessonId: 'lesson-1',
  nodeKey: 'practice-1',
};

const checkpoint: CourseAssessment = {
  id: 'assessment-1',
  courseId: 'course-1',
  kind: 'checkpoint',
  name: 'Paper 1',
  examDate: 2_000_000_000_000,
  afterLessonId: 'lesson-1',
  coverageMode: 'prefix',
  excludedCardIds: [],
  createdAt: 0,
  updatedAt: 0,
};

const checkpointNode: PathNode = {
  id: 'assessment-1',
  nodeType: 'checkpoint',
  assessment: checkpoint,
  afterLessonId: 'lesson-1',
};

function renderSegment(overrides: Partial<ComponentProps<typeof PathNodeWithLine>> = {}) {
  const onPracticeEdit = vi.fn();
  render(
    <PathNodeWithLine
      node={lessonNode}
      isLast={false}
      current={false}
      onLessonClick={vi.fn()}
      onPracticeClick={vi.fn()}
      onPracticeAssessmentClick={vi.fn()}
      onCheckpointClick={vi.fn()}
      onPracticeEdit={onPracticeEdit}
      authoring={false}
      {...overrides}
    />,
  );
  return { onPracticeEdit };
}

describe('PathNodeWithLine connector', () => {
  it('does not add a manual-practice authoring control to the path', () => {
    renderSegment({ authoring: true });
    expect(
      screen.queryByRole('button', { name: 'Add manual practice here' }),
    ).not.toBeInTheDocument();
  });
});

describe('PathNodeWithLine practice-node pencil', () => {
  it('hides the edit badge in Study mode', () => {
    const { onPracticeEdit } = renderSegment({ node: practiceNode, isLast: true });
    expect(
      screen.getByRole('button', { name: 'Manual practice: Weekly review, 0% secured' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Weekly review' })).not.toBeInTheDocument();
    expect(onPracticeEdit).not.toHaveBeenCalled();
  });

  it('opens the editor from the pencil in Author mode', () => {
    const { onPracticeEdit } = renderSegment({
      node: practiceNode,
      isLast: true,
      authoring: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly review' }));
    expect(onPracticeEdit).toHaveBeenCalledWith(practiceNode);
  });
});

describe('PathNodeWithLine checkpoint intent', () => {
  it('opens checkpoint details in Study mode', () => {
    renderSegment({ node: checkpointNode, isLast: true });

    expect(screen.getByRole('button', { name: 'Open checkpoint: Paper 1' })).toBeInTheDocument();
    expect(screen.queryByTitle('Edit checkpoint')).not.toBeInTheDocument();
  });

  it('presents the checkpoint as an edit action in Author mode', () => {
    renderSegment({ node: checkpointNode, isLast: true, authoring: true });

    expect(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' })).toBeInTheDocument();
    expect(screen.getByTitle('Edit checkpoint')).toBeInTheDocument();
  });
});
