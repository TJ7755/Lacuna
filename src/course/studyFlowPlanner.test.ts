import { describe, expect, it } from 'vitest';
import type { Lesson } from '../db/types';
import type { PathNode } from './path';
import { planNextStudyStep } from './studyFlowPlanner';
import type { CourseStudyFlowSnapshot, StudyFlowPracticeState } from './studyFlowSnapshot';
import type { AssessmentPracticeOption } from './assessmentPractice';

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
  return {
    id,
    nodeType: manual ? 'practice-manual' : 'practice-auto',
    afterLessonId: '1',
    nodeKey: id,
  };
}

function snapshot(
  nodes: PathNode[],
  practices: StudyFlowPracticeState[] = [],
  recurringPracticeEligibleCount = 0,
  assessmentOptions: AssessmentPracticeOption[] = [],
): CourseStudyFlowSnapshot {
  return {
    courseId: 'course',
    archived: false,
    nodes,
    practiceByKey: new Map(practices.map((practice) => [practice.nodeKey, practice])),
    activeManualNodeKeys: new Set(),
    completedManualNodeKeys: new Set(),
    recurringPracticeEligibleCount,
    assessmentOptions,
  };
}

function practiceState(nodeKey: string, active: boolean): StudyFlowPracticeState {
  return {
    nodeKey,
    nodeType: 'practice-manual',
    label: 'Checkpoint practice',
    scopeLessonIds: new Set(['1']),
    sessionScopeLessonIds: new Set(['1']),
    assessmentOptions: [],
    scopeVersion: 'v1',
    totalCount: 2,
    securedCount: 0,
    eligibleCount: active ? 2 : 0,
    completed: false,
    active,
  };
}

describe('planNextStudyStep', () => {
  it('selects an earlier active Practice boundary before a later lesson', () => {
    const nodes = [
      lessonNode('1', 'completed'),
      practiceNode('p1', true),
      lessonNode('2', 'available'),
    ];
    expect(planNextStudyStep(snapshot(nodes, [practiceState('p1', true)]))).toEqual({
      kind: 'step',
      step: {
        kind: 'practice',
        nodeKey: 'p1',
        mode: 'curricular',
        label: 'Checkpoint practice',
      },
    });
  });

  it('ignores a latent manual Practice boundary', () => {
    const nodes = [
      lessonNode('1', 'completed'),
      practiceNode('p1', true),
      lessonNode('2', 'available'),
    ];
    expect(planNextStudyStep(snapshot(nodes, [practiceState('p1', false)]))).toEqual({
      kind: 'step',
      step: { kind: 'lesson', lessonId: '2', label: 'Lesson 2' },
    });
  });

  it('distinguishes locked, complete, empty and archived courses', () => {
    expect(planNextStudyStep(snapshot([lessonNode('1', 'locked')]))).toEqual({
      kind: 'blocked',
      reason: 'curriculum-locked',
    });
    expect(planNextStudyStep(snapshot([lessonNode('1', 'completed')]))).toEqual({
      kind: 'complete',
    });
    expect(planNextStudyStep(snapshot([]))).toEqual({ kind: 'empty' });
    expect(planNextStudyStep({ ...snapshot([]), archived: true })).toEqual({
      kind: 'blocked',
      reason: 'archived',
    });
  });

  it('falls back to recurring course Practice after the curriculum', () => {
    expect(planNextStudyStep(snapshot([lessonNode('1', 'completed')], [], 3))).toEqual({
      kind: 'step',
      step: { kind: 'practice', nodeKey: 'end', mode: 'recurring', label: 'Practice' },
    });
  });

  it('offers ranked assessment revision without replacing the curriculum step', () => {
    const assessments = [
      { assessmentId: 'near', name: 'Near paper', examDate: 2, eligibleCount: 2 },
      { assessmentId: 'later', name: 'Later paper', examDate: 3, eligibleCount: 1 },
    ];
    expect(planNextStudyStep(snapshot([lessonNode('1', 'available')], [], 0, assessments))).toEqual(
      {
        kind: 'choice',
        step: { kind: 'lesson', lessonId: '1', label: 'Lesson 1' },
        assessments,
      },
    );
  });
});
