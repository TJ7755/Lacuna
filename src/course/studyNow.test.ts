import { describe, expect, it } from 'vitest';
import type { Lesson, PracticeNode } from '../db/types';
import type { PathNode } from './path';
import { nextStudyTarget } from './studyNow';

function lessonNode(id: string, status: 'completed' | 'available' | 'locked'): PathNode {
  const lesson: Lesson = {
    id,
    courseId: 'course',
    name: `Lesson ${id}`,
    orderIndex: Number(id),
    createdAt: 0,
    isExtension: false,
  };
  return { id, nodeType: 'lesson', lesson, status };
}

function practiceNode(id: string, manual = false): PathNode {
  const practiceNode: PracticeNode | undefined = manual
    ? {
        id,
        courseId: 'course',
        type: 'manual',
        name: 'Focused practice',
        createdAt: 0,
      }
    : undefined;
  return {
    id,
    nodeType: manual ? 'practice-manual' : 'practice-auto',
    practiceNode,
    afterLessonId: '1',
    nodeKey: id,
  };
}

describe('nextStudyTarget', () => {
  it('selects the first available lesson before later practice', () => {
    const nodes = [lessonNode('1', 'completed'), lessonNode('2', 'available'), practiceNode('p1')];
    const progress = new Map([['p1', { eligibleCount: 2, completed: false }]]);

    expect(nextStudyTarget(nodes, progress, true)).toEqual({
      kind: 'lesson',
      lessonId: '2',
      label: 'Lesson 2',
    });
  });

  it('selects an earlier unfinished practice node before a later lesson', () => {
    const nodes = [
      lessonNode('1', 'completed'),
      practiceNode('p1', true),
      lessonNode('2', 'available'),
    ];
    const progress = new Map([['p1', { eligibleCount: 2, completed: false }]]);

    expect(nextStudyTarget(nodes, progress, true)).toEqual({
      kind: 'practice',
      nodeKey: 'p1',
      label: 'Focused practice',
    });
  });

  it('skips persisted milestones and uses recurring end practice', () => {
    const nodes = [lessonNode('1', 'completed'), practiceNode('p1'), lessonNode('2', 'completed')];
    const progress = new Map([['p1', { eligibleCount: 2, completed: true }]]);

    expect(nextStudyTarget(nodes, progress, true)).toEqual({
      kind: 'practice-end',
      label: 'Practice',
    });
  });

  it('returns no target when nothing is actionable', () => {
    const nodes = [lessonNode('1', 'completed'), practiceNode('p1'), lessonNode('2', 'locked')];
    const progress = new Map([['p1', { eligibleCount: 0, completed: false }]]);

    expect(nextStudyTarget(nodes, progress, false)).toBeNull();
  });
});
