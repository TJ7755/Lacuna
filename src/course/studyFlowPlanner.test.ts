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
    updatedAt: 0,
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
    hasStudyHistory: true,
    archived: false,
    priorKnowledgeLessonIds: new Set(),
    nodes,
    practiceByKey: new Map(practices.map((practice) => [practice.nodeKey, practice])),
    activeManualNodeKeys: new Set(),
    completedManualNodeKeys: new Set(),
    recurringPracticeEligibleCount,
    examPracticeEligibleCount: 0,
    cardCount: 0,
    dueReviewCardIds: new Set(),
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
  it('offers scheduled reviews before available or locked curriculum', () => {
    for (const status of ['available', 'locked'] as const) {
      expect(
        planNextStudyStep({
          ...snapshot([lessonNode('1', status)], [], 1),
          hasStudyHistory: false,
        }),
      ).toMatchObject({
        kind: 'step',
        step: { mode: 'recurring' },
      });
    }
  });
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

  it('falls back to due review after the curriculum', () => {
    expect(planNextStudyStep(snapshot([lessonNode('1', 'completed')], [], 3))).toEqual({
      kind: 'step',
      step: {
        kind: 'practice',
        nodeKey: 'due-review',
        mode: 'recurring',
        label: 'Review due cards',
      },
    });
  });

  it('recommends preparation for the nearest applicable assessment without a separate plan', () => {
    const assessments = [
      { assessmentId: 'near', name: 'Near paper', examDate: 2, eligibleCount: 2 },
      { assessmentId: 'later', name: 'Later paper', examDate: 3, eligibleCount: 1 },
    ];
    expect(planNextStudyStep(snapshot([lessonNode('1', 'available')], [], 0, assessments))).toEqual(
      {
        kind: 'step',
        step: {
          kind: 'practice',
          nodeKey: 'assessment-near',
          mode: 'assessment',
          assessmentId: 'near',
          label: 'Prepare for Near paper',
        },
      },
    );
  });

  it('moves from recall to independent Questions and repairs demonstrated knowledge gaps first', () => {
    const next = {
      ...snapshot([lessonNode('1', 'completed')], [], 20),
      questionScopeConceptIds: ['enzymes'],
      questionOptions: [
        {
          conceptId: 'enzymes',
          name: 'Enzymes',
          needs: { knowledge: false, application: false, techniques: ['causal-link' as const] },
        },
      ],
    };
    const due = {
      kind: 'practice' as const,
      nodeKey: 'due-review',
      mode: 'recurring' as const,
      label: 'Review due cards',
    };
    expect(planNextStudyStep(next, true, due)).toMatchObject({
      kind: 'step',
      step: { kind: 'exam-questions', conceptId: 'enzymes' },
    });
    next.questionOptions[0] = {
      ...next.questionOptions[0],
      needs: { knowledge: true, application: false, techniques: [] },
    };
    const repair = {
      ...next,
      questionOptions: [{ ...next.questionOptions[0], repairLessonId: '1' }],
    };
    expect(planNextStudyStep(repair)).toMatchObject({
      kind: 'step',
      step: { kind: 'lesson', lessonId: '1' },
    });
    expect(
      planNextStudyStep(repair, true, { kind: 'lesson', lessonId: '1', label: 'Notes' }),
    ).toMatchObject({ kind: 'step', step: { kind: 'exam-questions' } });
  });
});

describe('mid-course entry', () => {
  const nodes = [
    lessonNode('1', 'available'),
    practiceNode('p1', true),
    lessonNode('2', 'available'),
    lessonNode('3', 'locked'),
  ];
  const joined = () => ({
    ...snapshot(nodes, [practiceState('p1', true)]),
    studyStartLessonId: '2',
    priorKnowledgeLessonIds: new Set(['1']),
  });

  it('starts at the joining lesson without requiring earlier lessons or practice', () => {
    expect(planNextStudyStep(joined())).toMatchObject({ kind: 'step', step: { lessonId: '2' } });
  });

  it('keeps current lessons ahead of catch-up, and offers catch-up when later lessons are locked', () => {
    expect(planNextStudyStep({ ...joined(), catchUpEligibleCount: 20 })).toMatchObject({
      kind: 'step',
      step: { lessonId: '2' },
    });
    expect(
      planNextStudyStep({
        ...joined(),
        catchUpEligibleCount: 20,
        nodes: [nodes[0], nodes[1], lessonNode('2', 'completed'), nodes[3]],
      }),
    ).toMatchObject({ kind: 'step', step: { mode: 'catch-up' } });
  });

  it('can finish the flow without automatically repeating completed catch-up', () => {
    expect(
      planNextStudyStep(
        {
          ...joined(),
          catchUpEligibleCount: 20,
          nodes: [nodes[0], nodes[1], lessonNode('2', 'completed'), nodes[3]],
        },
        false,
      ),
    ).toEqual({ kind: 'blocked', reason: 'curriculum-locked' });
  });

  it('starts at the chosen core lesson even when an extension precedes it', () => {
    const extension = lessonNode('0', 'available');
    if (extension.nodeType === 'lesson') extension.lesson.isExtension = true;
    expect(planNextStudyStep({ ...joined(), nodes: [extension, ...nodes] })).toMatchObject({
      kind: 'step',
      step: { lessonId: '2' },
    });
  });

  it('keeps due reviews ahead of the joining lesson', () => {
    expect(planNextStudyStep({ ...joined(), recurringPracticeEligibleCount: 1 })).toMatchObject({
      kind: 'step',
      step: { nodeKey: 'due-review' },
    });
  });

  it('continues forwards and never loops back into catch-up lessons', () => {
    expect(
      planNextStudyStep({
        ...joined(),
        nodes: [nodes[0], nodes[1], lessonNode('2', 'completed'), nodes[3]],
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'curriculum-locked',
    });
    expect(
      planNextStudyStep({ ...joined(), nodes: [nodes[0], nodes[1], lessonNode('2', 'completed')] }),
    ).toEqual({ kind: 'complete' });
  });

  it('falls back to the whole path if the starting lesson was removed', () => {
    expect(
      planNextStudyStep({
        ...joined(),
        studyStartLessonId: 'removed',
        priorKnowledgeLessonIds: new Set(),
      }),
    ).toMatchObject({
      kind: 'step',
      step: { lessonId: '1' },
    });
  });
});

it('recommends available exam practice for Cards outside named lesson coverage', () => {
  const input = snapshot([]);
  input.cardCount = 1;
  input.examPracticeEligibleCount = 1;
  expect(planNextStudyStep(input)).toMatchObject({
    kind: 'step',
    step: { kind: 'practice', mode: 'exam' },
  });
});
