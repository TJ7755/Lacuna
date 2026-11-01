import { describe, it, expect } from 'vitest';
import { buildPath, type PracticePathNode } from './path';
import { MS_PER_DAY } from '../fsrs/params';
import { makeCourse, makeLesson, makePracticeNode, makeExamDate } from './path.testFixtures';

describe('buildPath — practice nodes', () => {
  const lessons = [
    { id: 'l1', courseId: 'c1', orderIndex: 0 },
    { id: 'l2', courseId: 'c1', orderIndex: 1 },
    { id: 'l3', courseId: 'c1', orderIndex: 2 },
    { id: 'l4', courseId: 'c1', orderIndex: 3 },
  ].map((l) => makeLesson(l));

  it('inserts no auto-practice node when there are no due cards and the gap is small', () => {
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 10,
    });
    const nodes = buildPath(course, lessons, [], new Map(), [], 0, 30);
    expect(nodes.every((n) => n.nodeType !== 'practice-auto')).toBe(true);
  });

  it('inserts an auto-practice node once minutes-to-clear crosses the far threshold', () => {
    const now = 0;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 10,
      examDate: 100 * MS_PER_DAY, // well in the future relative to `now`
    });
    // 100 due cards x 8s = ~13.3 minutes, above the 12-minute far threshold.
    const nodes = buildPath(course, lessons, [], new Map(), [], 100, 8, now);
    const autoNodes = nodes.filter((n): n is PracticePathNode => n.nodeType === 'practice-auto');
    expect(autoNodes.length).toBeGreaterThan(0);
    // First auto node lands right after the first lesson (lessonsSinceLastPractice = 1).
    expect(autoNodes[0].afterLessonId).toBe('l1');
  });

  it('uses the tighter near-exam threshold once inside practiceUrgentWindowDays', () => {
    const now = 0;
    const dueCardCount = 50; // 50 x 8s = ~6.7 minutes: below far (12) but above near (3).
    const farCourse = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 10,
      practiceThresholdMinutesNear: 3,
      examDate: 100 * MS_PER_DAY, // far in the future -> far threshold applies
    });
    const nearCourse = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 10,
      practiceThresholdMinutesNear: 3,
      examDate: 1 * MS_PER_DAY, // inside the default 7-day urgent window
    });
    const farNodes = buildPath(
      farCourse,
      lessons,
      [],
      new Map(),
      [],
      dueCardCount,
      8,
      now,
      undefined,
      farCourse.examDate,
    );
    const nearNodes = buildPath(
      nearCourse,
      lessons,
      [],
      new Map(),
      [],
      dueCardCount,
      8,
      now,
      undefined,
      nearCourse.examDate,
    );
    expect(farNodes.some((n) => n.nodeType === 'practice-auto')).toBe(false);
    expect(nearNodes.some((n) => n.nodeType === 'practice-auto')).toBe(true);
  });

  it('the practiceMaxGap backstop forces a practice node even with no due cards', () => {
    const now = 0;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 3,
    });
    const nodes = buildPath(course, lessons, [], new Map(), [], 0, 0, now);
    const autoNodes = nodes.filter((n): n is PracticePathNode => n.nodeType === 'practice-auto');
    // Backstop trips after the 3rd lesson (l3).
    expect(autoNodes.length).toBe(1);
    expect(autoNodes[0].afterLessonId).toBe('l3');
  });

  it('gives auto practice a stable key and attaches its persisted milestone', () => {
    const course = makeCourse({ id: 'c1', autoPractice: true, practiceMaxGap: 1 });
    const oneLesson = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const milestone = {
      nodeKey: 'practice-auto-c1-l1',
      courseId: 'c1',
      scopeVersion: 'v1',
      securedCardCount: 1,
      totalCardCount: 2,
      updatedAt: 1,
    };
    const nodes = buildPath(course, oneLesson, [], new Map(), [], 0, 0, 0, {
      exposures: [],
      lessonCompletions: [],
      practiceMilestones: [milestone],
    });
    const practice = nodes.find(
      (node): node is PracticePathNode => node.nodeType === 'practice-auto',
    );
    expect(practice?.id).toBe('practice-auto-c1-l1');
    expect(practice?.nodeKey).toBe('practice-auto-c1-l1');
    expect(practice?.milestone).toEqual(milestone);
  });

  it('yields periodic auto-practice nodes (not one per lesson) under a sustained large backlog', () => {
    const now = 0;
    const manyLessons = Array.from({ length: 10 }, (_, i) =>
      makeLesson({ id: `m${i + 1}`, courseId: 'c1', orderIndex: i }),
    );
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 3,
      examDate: 100 * MS_PER_DAY, // far in the future -> far threshold applies
    });
    // 500 due cards x 8s = ~67 minutes, comfortably above the far threshold for
    // every lesson in the walk — a static snapshot that never clears.
    const nodes = buildPath(course, manyLessons, [], new Map(), [], 500, 8, now);
    const autoNodes = nodes.filter((n): n is PracticePathNode => n.nodeType === 'practice-auto');
    // Regression for the bug where the volume trigger, once true, fired again on
    // every subsequent lesson: 10 lessons must NOT produce 10 auto nodes.
    expect(autoNodes.length).toBeLessThan(manyLessons.length);
    // The first node fires as soon as the volume trigger is evaluated (after the
    // first lesson); after that, only the practiceMaxGap backstop can re-trip it,
    // so nodes land roughly every practiceMaxGap lessons: after m1, m4, m7, m10.
    expect(autoNodes.map((n) => n.afterLessonId)).toEqual(['m1', 'm4', 'm7', 'm10']);
  });

  it('does not auto-insert practice nodes when course.autoPractice is false', () => {
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: false,
      practiceMaxGap: 1,
    });
    const nodes = buildPath(course, lessons, [], new Map(), [], 10_000, 100);
    expect(nodes.every((n) => n.nodeType !== 'practice-auto')).toBe(true);
  });

  it('places a manual practice node after the lesson at its stored position', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open', autoPractice: false });
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    const nodes = buildPath(course, lessons, [], new Map(), [manual]);
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'l2', 'pn1', 'l3', 'l4']);
    const pn = nodes.find((n) => n.id === 'pn1');
    expect(pn?.nodeType).toBe('practice-manual');
    if (pn?.nodeType === 'practice-manual') {
      expect(pn.afterLessonId).toBe('l2');
      expect(pn.practiceNode).toBe(manual);
    }
  });

  it('places a manual practice node before every lesson when position is undefined', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open', autoPractice: false });
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual' });
    const nodes = buildPath(course, lessons, [], new Map(), [manual]);
    expect(nodes[0].id).toBe('pn1');
    if (nodes[0].nodeType === 'practice-manual') {
      expect(nodes[0].afterLessonId).toBeNull();
    }
  });

  it('resets lessonsSinceLastPractice at a manual node, so the backstop counts from there', () => {
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'open',
      autoPractice: true,
      practiceMaxGap: 2,
    });
    // Manual node sits right after l1; the backstop should only re-trip after
    // 2 more lessons (l3), not re-count from the very start.
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 0 });
    const nodes = buildPath(course, lessons, [], new Map(), [manual], 0, 0);
    const autoNodes = nodes.filter((n): n is PracticePathNode => n.nodeType === 'practice-auto');
    expect(autoNodes.length).toBe(1);
    expect(autoNodes[0].afterLessonId).toBe('l3');
  });

  describe('denser defaults with short lesson fixtures', () => {
    const denserDefaults = {
      practiceThresholdMinutesFar: 8,
      practiceThresholdMinutesNear: 4,
      practiceMaxGap: 2,
    } as const;

    function autoPracticeAfterLessons(
      lessonCount: number,
      cardsPerLesson: number,
      examDaysAway: number,
    ): string[] {
      const now = 0;
      const fixtureLessons = Array.from({ length: lessonCount }, (_, index) =>
        makeLesson({ id: `short-${index + 1}`, courseId: 'c1', orderIndex: index }),
      );
      const course = makeCourse({
        id: 'c1',
        autoPractice: true,
        examDate: examDaysAway * MS_PER_DAY,
        ...denserDefaults,
      });
      const dueCardCount = lessonCount * cardsPerLesson;
      const nodes = buildPath(
        course,
        fixtureLessons,
        [],
        new Map(),
        [],
        dueCardCount,
        8,
        now,
        undefined,
        course.examDate,
      );
      return nodes
        .filter((node): node is PracticePathNode => node.nodeType === 'practice-auto')
        .map((node) => node.afterLessonId)
        .filter((lessonId): lessonId is string => lessonId !== null);
    }

    it('consolidates a small course after two short lessons without interrupting the first', () => {
      expect(autoPracticeAfterLessons(3, 4, 30)).toEqual(['short-2']);
    });

    it('spaces practice every two lessons through a medium course below the far workload threshold', () => {
      // 8 lessons x 5 cards x 8 seconds = 5.3 minutes, below the 8-minute far threshold.
      expect(autoPracticeAfterLessons(8, 5, 30)).toEqual([
        'short-2',
        'short-4',
        'short-6',
        'short-8',
      ]);
    });

    it('responds immediately to a large course backlog, then returns to the two-lesson cadence', () => {
      // 18 lessons x 8 cards x 8 seconds = 19.2 minutes, above the far threshold.
      expect(autoPracticeAfterLessons(18, 8, 30)).toEqual([
        'short-1',
        'short-3',
        'short-5',
        'short-7',
        'short-9',
        'short-11',
        'short-13',
        'short-15',
        'short-17',
      ]);
    });

    it('uses the lower near-exam threshold for a medium course backlog', () => {
      // The same 5.3-minute medium workload is below the far threshold but above the
      // 4-minute near threshold, so the first consolidation point moves forwards.
      expect(autoPracticeAfterLessons(8, 5, 3)).toEqual([
        'short-1',
        'short-3',
        'short-5',
        'short-7',
      ]);
    });
  });
});

it('keeps manual anchors and practice milestones while automatic practice follows local order', () => {
  const course = makeCourse({
    id: 'c1',
    autoPractice: true,
    practiceMaxGap: 1,
    localLessonOrder: ['b', 'c', 'a'],
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const lessons = ['a', 'b', 'c'].map((id, orderIndex) =>
    makeLesson({ id, courseId: course.id, orderIndex }),
  );
  const final = makeExamDate({ id: 'final', courseId: course.id, kind: 'final' });
  const manual = makePracticeNode({
    id: 'manual',
    courseId: course.id,
    type: 'manual',
    position: 1,
  });
  const before = makePracticeNode({ id: 'before', courseId: course.id, type: 'manual' });
  const questionSet = makePracticeNode({
    id: 'questions',
    courseId: course.id,
    type: 'question-set',
    afterLessonId: 'c',
    questionSetIds: ['set'],
  });
  const milestones = ['manual', 'practice-auto-c1-c'].map((nodeKey) => ({
    nodeKey,
    courseId: course.id,
    scopeVersion: 'v1',
    securedCardCount: 1,
    totalCardCount: 1,
    updatedAt: 1,
    completedAt: 1,
  }));
  const nodes = buildPath(
    course,
    lessons,
    [final],
    new Map(),
    [manual, before, questionSet],
    0,
    0,
    0,
    {
      exposures: [],
      lessonCompletions: [],
      practiceMilestones: milestones,
    },
  );
  expect(nodes.map((node) => node.id)).toEqual([
    'before',
    'b',
    'manual',
    'c',
    'questions',
    'practice-auto-c1-c',
    'a',
    'practice-auto-c1-a',
  ]);
  expect(nodes.find((node) => node.id === 'manual')).toMatchObject({
    afterLessonId: 'b',
    milestone: milestones[0],
  });
  expect(nodes.find((node) => node.id === 'practice-auto-c1-c')).toMatchObject({
    afterLessonId: 'c',
    milestone: milestones[1],
  });
  expect(lessons.map((lesson) => lesson.orderIndex)).toEqual([0, 1, 2]);
});
