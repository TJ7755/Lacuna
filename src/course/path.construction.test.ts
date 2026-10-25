import { describe, it, expect } from 'vitest';
import {
  buildPath,
  practiceGateAfterLesson,
  manualPracticeGateOutcomeAfterLesson,
  type PathNode,
  type PracticePathNode,
} from './path';
import { type Card } from '../db/types';
import {
  makeCourse,
  makeLesson,
  makeCard,
  makePracticeNode,
  makeExamDate,
} from './path.testFixtures';

describe('buildPath', () => {
  it('builds lesson nodes in orderIndex order, including extensions', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 2, isExtension: true }),
    ];
    const nodes = buildPath(course, lessons, [], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'l2', 'ext']);
    expect(nodes.every((n) => n.nodeType === 'lesson')).toBe(true);
  });

  it('places a checkpoint after its independent placement anchor', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
    ];
    const checkpoint = makeExamDate({
      id: 'cp1',
      courseId: 'c1',
      lessonIds: ['l1'],
      afterLessonId: 'l2',
    });
    const nodes = buildPath(course, lessons, [checkpoint], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'l2', 'cp1', 'l3']);
    const cpNode = nodes.find((n) => n.id === 'cp1');
    expect(cpNode?.nodeType).toBe('checkpoint');
    if (cpNode?.nodeType === 'checkpoint') {
      expect(cpNode.afterLessonId).toBe('l2');
    }
  });

  it('places prefix coverage after its anchor', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1', afterLessonId: 'l2' });
    const nodes = buildPath(course, lessons, [checkpoint], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'l2', 'cp1']);
    const cpNode = nodes.find((n) => n.id === 'cp1');
    if (cpNode?.nodeType === 'checkpoint') {
      expect(cpNode.afterLessonId).toBe('l2');
    }
  });

  it('renders a checkpoint with no lessons at all (afterLessonId null)', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
    const nodes = buildPath(course, [], [checkpoint], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['cp1']);
    const cpNode = nodes[0];
    if (cpNode.nodeType === 'checkpoint') {
      expect(cpNode.afterLessonId).toBeNull();
    }
  });

  it('computes lesson status from supplied membership and exposure progress', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    const l1 = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 });
    const l2 = makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 });
    const lessons = [l1, l2];
    const cardsById = new Map<string, Card[]>([
      ['l1', [makeCard({ id: 'a', deckId: 'd', state: 0 })]],
      ['l2', [makeCard({ id: 'b', deckId: 'd', state: 0 })]], // locked anyway
    ]);
    const nodes = buildPath(course, lessons, [], cardsById, [], 0, 0, Date.now(), {
      exposures: [{ lessonId: 'l1', cardId: 'a', taughtAt: 1, updatedAt: 1 }],
      lessonCompletions: [],
      practiceMilestones: [],
    });
    const n1 = nodes.find((n) => n.id === 'l1');
    const n2 = nodes.find((n) => n.id === 'l2');
    if (n1?.nodeType === 'lesson') expect(n1.status).toBe('completed');
    if (n2?.nodeType === 'lesson') expect(n2.status).toBe('locked');
  });

  it('keeps a lesson available until every required card has been taught', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 });
    const cardsById = new Map<string, Card[]>([
      [
        'l1',
        [
          makeCard({ id: 'a', deckId: 'd', state: 0 }),
          makeCard({ id: 'b', deckId: 'd', state: 0 }),
        ],
      ],
    ]);
    const statusAfter = (taught: string[]) => {
      const node = buildPath(course, [lesson], [], cardsById, [], 0, 0, Date.now(), {
        exposures: taught.map((cardId) => ({ lessonId: 'l1', cardId, taughtAt: 1, updatedAt: 1 })),
        lessonCompletions: [],
        practiceMilestones: [],
      }).find((n) => n.id === 'l1');
      return node?.nodeType === 'lesson' ? node.status : undefined;
    };

    expect(statusAfter(['a'])).toBe('available');
    expect(statusAfter(['a', 'b'])).toBe('completed');
  });

  it('orders multiple checkpoints sharing a slot deterministically', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const cp1 = makeExamDate({
      id: 'cp1',
      courseId: 'c1',
      lessonIds: ['l1'],
      afterLessonId: 'l1',
    });
    const cp2 = makeExamDate({
      id: 'cp2',
      courseId: 'c1',
      lessonIds: ['l1'],
      afterLessonId: 'l1',
    });
    const nodes = buildPath(course, lessons, [cp1, cp2], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'cp1', 'cp2', 'l2']);
  });
});

describe('buildPath — tied lesson order', () => {
  it('places a checkpoint directly after its anchor when lessons share an orderIndex', () => {
    // Merging lessons added on two devices can leave equal orderIndex values. The path
    // must break ties the same way assessment coverage does (createdAt, then id).
    const course = makeCourse({ id: 'c1' });
    const lessons = [
      makeLesson({ id: 'lb', courseId: 'c1', orderIndex: 0, createdAt: 5 }),
      makeLesson({ id: 'la', courseId: 'c1', orderIndex: 0, createdAt: 1 }),
      makeLesson({ id: 'lc', courseId: 'c1', orderIndex: 1, createdAt: 0 }),
    ];
    const checkpoint = makeExamDate({ id: 'cp', courseId: 'c1', afterLessonId: 'lb' });

    const ids = buildPath(course, lessons, [checkpoint], new Map(), [], 0, 0, 0).map(
      (node) => node.id,
    );

    expect(ids.filter((id) => id !== 'cp')).toEqual(['la', 'lb', 'lc']);
    expect(ids[ids.indexOf('cp') - 1]).toBe('lb');
  });
});

describe('buildPath progress and manual-node edge cases', () => {
  it('uses course completion records and scheduling state when introductions are skipped', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open', learnFirst: false });
    const lessons = [
      makeLesson({ id: 'cardless', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'reviewed', courseId: 'c1', orderIndex: 1 }),
    ];
    const nodes = buildPath(
      course,
      lessons,
      [],
      new Map([['reviewed', [makeCard({ id: 'reviewed-card', deckId: 'd1', state: 2 })]]]),
      [],
      0,
      0,
      0,
      {
        exposures: [],
        lessonCompletions: [{ lessonId: 'cardless', completedAt: 1, updatedAt: 1 }],
        practiceMilestones: [],
      },
    );

    expect(
      nodes
        .filter(
          (node): node is Extract<PathNode, { nodeType: 'lesson' }> => node.nodeType === 'lesson',
        )
        .map((node) => [node.id, node.status]),
    ).toEqual([
      ['cardless', 'completed'],
      ['reviewed', 'completed'],
    ]);
  });

  it('orders simultaneous manual nodes by id and restores their milestones', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const first = makePracticeNode({
      id: 'a',
      courseId: 'c1',
      type: 'manual',
      position: 0,
      createdAt: 1,
    });
    const second = makePracticeNode({
      id: 'b',
      courseId: 'c1',
      type: 'manual',
      position: 0,
      createdAt: 1,
    });
    const initial = buildPath(course, lessons, [], new Map(), [second, first]);
    const manual = initial.filter(
      (node): node is PracticePathNode => node.nodeType === 'practice-manual',
    );
    const milestone = {
      nodeKey: manual[0].nodeKey,
      courseId: course.id,
      scopeVersion: 'v1',
      securedCardCount: 1,
      totalCardCount: 1,
      updatedAt: 2,
    };

    const restored = buildPath(course, lessons, [], new Map(), [second, first], 0, 0, 0, {
      exposures: [],
      lessonCompletions: [],
      practiceMilestones: [milestone],
    });
    const restoredManual = restored.filter(
      (node): node is PracticePathNode => node.nodeType === 'practice-manual',
    );

    expect(manual.map((node) => node.id)).toEqual(['a', 'b']);
    expect(restoredManual[0].milestone).toEqual(milestone);
  });

  it('anchors a Question Set activity to its lesson without adding a Card practice gate', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    const lessons = [
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 1 }),
    ];
    const questionActivity = makePracticeNode({
      id: 'question-activity',
      courseId: 'c1',
      type: 'question-set',
      questionSetIds: ['set-3', 'set-1', 'set-2'],
      afterLessonId: 'l1',
    });
    const nodes = buildPath(course, lessons, [], new Map(), [questionActivity]);
    expect(nodes.map((node) => node.nodeType)).toEqual([
      'lesson',
      'lesson',
      'practice-question-set',
    ]);
    expect(nodes[2]).toMatchObject({
      id: 'question-activity',
      nodeKey: 'question-activity',
      questionSetIds: ['set-3', 'set-1', 'set-2'],
      afterLessonId: 'l1',
    });
    expect(practiceGateAfterLesson(lessons, [questionActivity], 'l1')).toBe(false);
    expect(
      manualPracticeGateOutcomeAfterLesson(
        lessons,
        [questionActivity],
        'l1',
        new Set(['question-activity']),
        new Set(),
      ),
    ).toBeUndefined();
  });

  it('orders Practice Qs activities by creation and drops ones without a lesson in this course', () => {
    const course = makeCourse({ id: 'c1' });
    const lessons = [makeLesson({ id: 'l0', courseId: 'c1', orderIndex: 0 })];
    const activity = (id: string, createdAt: number, overrides = {}) =>
      makePracticeNode({
        id,
        courseId: 'c1',
        type: 'question-set',
        questionSetIds: [`set-${id}`],
        afterLessonId: 'l0',
        createdAt,
        ...overrides,
      });
    const nodes = buildPath(course, lessons, [], new Map(), [
      activity('later', 2),
      activity('b-tied', 1),
      activity('a-tied', 1),
      activity('missing-lesson', 0, { afterLessonId: 'gone' }),
      activity('other-course', 0, { courseId: 'c2' }),
    ]);
    expect(nodes.map((node) => node.id)).toEqual(['l0', 'a-tied', 'b-tied', 'later']);
  });
});
