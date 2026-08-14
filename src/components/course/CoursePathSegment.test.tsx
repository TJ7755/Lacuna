import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Lesson, PracticeNode } from '../../db/types';
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

function renderSegment(overrides: Partial<ComponentProps<typeof PathNodeWithLine>> = {}) {
  const onInsertOnLine = vi.fn();
  const onPracticeEdit = vi.fn();
  render(
    <PathNodeWithLine
      node={lessonNode}
      isLast={false}
      lineInsert={{ insertable: true, position: 0 }}
      current={false}
      onLessonClick={vi.fn()}
      onPracticeClick={vi.fn()}
      onPracticeAssessmentClick={vi.fn()}
      onCheckpointClick={vi.fn()}
      onPracticeEdit={onPracticeEdit}
      onInsertOnLine={onInsertOnLine}
      authoring={false}
      {...overrides}
    />,
  );
  return { onInsertOnLine, onPracticeEdit };
}

describe('PathNodeWithLine mid-path insert', () => {
  it('hides Manual practice in Read mode', () => {
    const { onInsertOnLine } = renderSegment();
    expect(
      screen.queryByRole('button', { name: 'Add manual practice here' }),
    ).not.toBeInTheDocument();
    expect(onInsertOnLine).not.toHaveBeenCalled();
  });

  it('inserts Manual practice on the connecting line in Edit mode', () => {
    const { onInsertOnLine } = renderSegment({ authoring: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add manual practice here' }));
    expect(onInsertOnLine).toHaveBeenCalledWith(0);
  });
});

describe('PathNodeWithLine practice-node pencil', () => {
  it('hides the edit badge in Read mode', () => {
    const { onPracticeEdit } = renderSegment({ node: practiceNode, isLast: true });
    expect(
      screen.getByRole('button', { name: 'Manual practice: Weekly review, 0% secured' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Weekly review' })).not.toBeInTheDocument();
    expect(onPracticeEdit).not.toHaveBeenCalled();
  });

  it('opens the editor from the pencil in Edit mode', () => {
    const { onPracticeEdit } = renderSegment({
      node: practiceNode,
      isLast: true,
      authoring: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly review' }));
    expect(onPracticeEdit).toHaveBeenCalledWith(practiceNode);
  });
});
