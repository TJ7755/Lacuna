import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  upsertLessonCardExposure,
} from '../../db/repository';
import { savePracticeMilestoneProgress } from '../../db/practiceNodeRepository';
import { db } from '../../db/schema';
import type { Course, Lesson } from '../../db/types';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { PathNode } from '../../course/path';
import { planNextStudyStep } from '../../course/studyFlowPlanner';
import { buildCourseStudyFlowSnapshot } from '../../course/studyFlowSnapshot';
import { makeExamDateContext } from '../../fsrs/examDate';
import { useLearnSession, type UseLearnSessionParams } from './useLearnSession';

const distraction: DistractionTracker = {
  beginCard: vi.fn(),
  setAnswerVisible: vi.fn(),
  wasDistracted: () => false,
  blurredMs: () => 0,
  sessionMs: () => 1,
};
const emptyFilterParams: never[] = [];

type NodeSpec =
  | { kind: 'auto' }
  | { kind: 'manual'; position: number; authoredFirstLessonOnly?: boolean };

function pathFor(lessons: Lesson[], practice: PathNode, afterIndex: number): PathNode[] {
  const nodes: PathNode[] = lessons.map((lesson) => ({
    id: lesson.id,
    nodeType: 'lesson',
    lesson,
    status: 'completed',
  }));
  nodes.splice(afterIndex + 1, 0, practice);
  return nodes;
}

async function snapshotOf(course: Course, lessons: Lesson[], nodes: PathNode[]) {
  const [cards, links, exposures, milestones] = await Promise.all([
    db.cards.toArray(),
    db.lessonCards.toArray(),
    db.lessonCardExposures.toArray(),
    db.practiceMilestones.toArray(),
  ]);
  return buildCourseStudyFlowSnapshot({
    course,
    nodes,
    cards,
    links,
    exposures,
    examDateContext: makeExamDateContext(course, lessons, []),
    meanReviewSeconds: 30,
    practiceMilestones: milestones,
    now: Date.now(),
  });
}

async function seedLesson(courseId: string, name: string) {
  const lesson = await createLesson(courseId, name);
  const card = await createLessonCard(courseId, lesson.id, 'front_back', `${name} front`, 'back');
  await upsertLessonCardExposure(lesson.id, card.id);
  return lesson;
}

function plannedPracticeKey(snapshot: Awaited<ReturnType<typeof snapshotOf>>) {
  const planned = planNextStudyStep(snapshot);
  return planned.kind === 'step' && planned.step.kind === 'practice'
    ? planned.step.nodeKey
    : undefined;
}

beforeEach(async () => {
  await Promise.all(
    [
      db.cards,
      db.schedulingUnits,
      db.sessionHistory,
      db.userPerformance,
      db.coursePerformance,
      db.schedulingPerformance,
      db.reviewHistory,
      db.courses,
      db.lessons,
      db.lessonCards,
      db.lessonCardExposures,
      db.practiceNodes,
      db.practiceMilestones,
    ].map((table) => table.clear()),
  );
});

describe('curricular Practice milestone scope (#358)', () => {
  it.each<[string, NodeSpec]>([
    ['an automatic node', { kind: 'auto' }],
    ['a prefix-based manual node', { kind: 'manual', position: 0 }],
    [
      'a manual node with an authored scope',
      { kind: 'manual', position: 1, authoredFirstLessonOnly: true },
    ],
  ])('records %s against its fixed scope, so completion holds', async (_name, spec) => {
    const course = await createCourse('Chemistry');
    const l1 = await seedLesson(course.id, 'One');
    const l2 = await seedLesson(course.id, 'Two');
    let lessons = [l1, l2];
    let practice: PathNode;
    let afterIndex = 0;
    if (spec.kind === 'auto') {
      practice = { id: 'auto', nodeType: 'practice-auto', afterLessonId: l1.id, nodeKey: 'auto' };
    } else {
      const record = await createPracticeNode(course.id, {
        type: 'manual',
        name: 'Checkpoint',
        position: spec.position,
        lessonIds: spec.authoredFirstLessonOnly ? [l1.id] : undefined,
      });
      afterIndex = spec.position;
      practice = {
        id: record.id,
        nodeType: 'practice-manual',
        practiceNode: record,
        afterLessonId: lessons[afterIndex].id,
        nodeKey: record.id,
      };
    }
    const nodeKey = (practice as { nodeKey: string }).nodeKey;

    const before = await snapshotOf(course, lessons, pathFor(lessons, practice, afterIndex));
    const state = before.practiceByKey.get(nodeKey)!;
    expect(state.completed).toBe(false);

    const params: UseLearnSessionParams = {
      courseId: course.id,
      lessonId: undefined,
      sessionId: undefined,
      tagFilter: null,
      filterParams: emptyFilterParams,
      requestScopeLessonIds: [...state.sessionScopeLessonIds],
      requestMilestoneLessonIds: [...state.scopeLessonIds],
      practiceNodeKeyParam: nodeKey,
      requestAssessmentId: undefined,
      requestPlanId: undefined,
      requestWindowId: undefined,
      plannedRevision: false,
      reviewSessionKind: 'practice',
      isSimpleMode: false,
      mode: 'fsrs',
      navigate: vi.fn(),
      notify: vi.fn(),
      distraction,
    };
    const { result } = renderHook(() => useLearnSession(params));
    await waitFor(() => expect(result.current.phase).toBe('question'));
    act(() => result.current.reveal());
    await waitFor(() => expect(result.current.phase).toBe('answer'));
    await act(async () => {
      await result.current.answer(true);
    });

    // The persisted identity is the one the snapshot checks, not the wider live pool.
    const persisted = await db.practiceMilestones.get(nodeKey);
    expect(persisted?.scopeVersion).toBe(state.scopeVersion);

    // Complete it under that identity, as finishing the session does.
    await savePracticeMilestoneProgress(
      nodeKey,
      course.id,
      persisted!.scopeVersion,
      persisted!.totalCardCount,
      persisted!.totalCardCount,
      true,
    );
    const after = await snapshotOf(course, lessons, pathFor(lessons, practice, afterIndex));
    expect(after.practiceByKey.get(nodeKey)?.completed).toBe(true);
    expect(after.practiceByKey.get(nodeKey)?.active).toBe(false);
    expect(plannedPracticeKey(after)).not.toBe(nodeKey);

    // A later reached lesson widens the live pool but must not revive the milestone.
    const l3 = await seedLesson(course.id, 'Three');
    lessons = [...lessons, l3];
    const later = await snapshotOf(course, lessons, pathFor(lessons, practice, afterIndex));
    expect(later.practiceByKey.get(nodeKey)?.completed).toBe(true);
    expect(later.practiceByKey.get(nodeKey)?.active).toBe(false);
    expect(plannedPracticeKey(later)).not.toBe(nodeKey);
  });
});
