import { describe, it, expect } from 'vitest';
import {
  lessonEffectiveReleaseDates,
  isLessonUnlocked,
  lessonStatus,
  buildPath,
  pathPosition,
  practiceGateAfterLesson,
  KNOWN_NODE_TYPES,
  nearestExamDate,
  examIsUrgent,
  EXAM_URGENT_DAYS,
  type PathNode,
  type PracticePathNode,
} from './path';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import type { Card, Course, CourseExamDate, Lesson, PracticeNode } from '../db/types';

// ---------------------------------------------------------------------------
// Fixture helpers (mirroring useCourseData.test.ts)
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    name: 'Test course',
    description: '',
    createdAt: 0,
    examDate: 7 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 12,
    practiceThresholdMinutesNear: 6,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 3,
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson> & Pick<Lesson, 'id' | 'courseId'>): Lesson {
  return {
    name: 'Test lesson',
    orderIndex: 0,
    createdAt: 0,
    isExtension: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    type: 'front_back',
    front: '',
    back: '',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...overrides,
  };
}

function makePracticeNode(
  overrides: Partial<PracticeNode> & Pick<PracticeNode, 'id' | 'courseId' | 'type'>,
): PracticeNode {
  return {
    name: 'Practice',
    createdAt: 0,
    ...overrides,
  };
}

function makeExamDate(
  overrides: Partial<CourseExamDate> & Pick<CourseExamDate, 'id' | 'courseId'>,
): CourseExamDate {
  return {
    name: 'Checkpoint',
    examDate: 10 * MS_PER_DAY,
    createdAt: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// lessonEffectiveReleaseDates
// ---------------------------------------------------------------------------

describe('lessonEffectiveReleaseDates', () => {
  it('returns undefined dates when linearCadence is absent', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'linear' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(dates.get('l1')).toBeUndefined();
    expect(dates.get('l2')).toBeUndefined();
  });

  it('cascades from the anchor date at the cadence interval', () => {
    const anchor = 1_000_000;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: anchor, intervalDays: 7 },
    });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(dates.get('l1')).toBe(anchor);
    expect(dates.get('l2')).toBe(anchor + 7 * MS_PER_DAY);
    expect(dates.get('l3')).toBe(anchor + 14 * MS_PER_DAY);
  });

  it('cascades a releaseDate override forward to later lessons', () => {
    const anchor = 1_000_000;
    const override = 50_000_000;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: anchor, intervalDays: 7 },
    });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1, releaseDate: override }),
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(dates.get('l1')).toBe(anchor);
    expect(dates.get('l2')).toBe(override);
    expect(dates.get('l3')).toBe(override + 7 * MS_PER_DAY);
  });

  it('skips extension lessons in the walk and gives them no date', () => {
    const anchor = 1_000_000;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: anchor, intervalDays: 7 },
    });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 1, isExtension: true }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 2 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(dates.get('l1')).toBe(anchor);
    expect(dates.get('ext')).toBeUndefined();
    // The extension consumed no slot: l2 is one interval after l1, not two.
    expect(dates.get('l2')).toBe(anchor + 7 * MS_PER_DAY);
  });

  it('sorts by orderIndex regardless of array order', () => {
    const anchor = 0;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: anchor, intervalDays: 1 },
    });
    const lessons = [
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(dates.get('l1')).toBe(0);
    expect(dates.get('l2')).toBe(MS_PER_DAY);
    expect(dates.get('l3')).toBe(2 * MS_PER_DAY);
  });
});

// ---------------------------------------------------------------------------
// isLessonUnlocked
// ---------------------------------------------------------------------------

describe('isLessonUnlocked', () => {
  it('open mode unlocks every lesson', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    for (const l of lessons) {
      expect(isLessonUnlocked(course, l, dates, lessons)).toBe(true);
    }
  });

  it('extension lessons are always unlocked, even under linear mode pre-release', () => {
    const now = 100;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: now + 1_000_000, intervalDays: 7 },
    });
    const ext = makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 1, isExtension: true });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }), ext];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(isLessonUnlocked(course, ext, dates, lessons, now)).toBe(true);
  });

  it('linear mode unlocks once the effective date has passed', () => {
    const now = 10 * MS_PER_DAY;
    const course = makeCourse({
      id: 'c1',
      unlockMode: 'linear',
      linearCadence: { anchorDate: 0, intervalDays: 7 },
    });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }), // date 0 -> unlocked
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }), // date 7d -> unlocked
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }), // date 14d -> locked
    ];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(isLessonUnlocked(course, lessons[0], dates, lessons, now)).toBe(true);
    expect(isLessonUnlocked(course, lessons[1], dates, lessons, now)).toBe(true);
    expect(isLessonUnlocked(course, lessons[2], dates, lessons, now)).toBe(false);
  });

  it('linear mode without a cadence unlocks everything', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'linear' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(isLessonUnlocked(course, lessons[0], dates, lessons)).toBe(true);
  });

  it('semi-linear unlocks the first core lesson and anything with unlockedAt', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    const l1 = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 });
    const l2 = makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 });
    const l3 = makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2, unlockedAt: 123 });
    const lessons = [l1, l2, l3];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(isLessonUnlocked(course, l1, dates, lessons)).toBe(true); // first core
    expect(isLessonUnlocked(course, l2, dates, lessons)).toBe(false); // no ratchet
    expect(isLessonUnlocked(course, l3, dates, lessons)).toBe(true); // ratcheted
  });

  it('semi-linear: the first core lesson is the lowest-orderIndex non-extension lesson', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    // An extension lesson has the lowest orderIndex but must not count as "first core".
    const ext = makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 0, isExtension: true });
    const l1 = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 1 });
    const l2 = makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 2 });
    const lessons = [ext, l1, l2];
    const dates = lessonEffectiveReleaseDates(course, lessons);
    expect(isLessonUnlocked(course, l1, dates, lessons)).toBe(true);
    expect(isLessonUnlocked(course, l2, dates, lessons)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lessonStatus
// ---------------------------------------------------------------------------

describe('lessonStatus', () => {
  it('returns locked when not unlocked', () => {
    expect(lessonStatus(false, 'l1', [], [], [])).toBe('locked');
    expect(lessonStatus(false, 'l1', [makeCard({ id: 'a', deckId: 'd', state: 2 })], [], [])).toBe(
      'locked',
    );
  });

  it('requires explicit completion for an unlocked lesson with zero cards', () => {
    expect(lessonStatus(true, 'l1', [], [], [])).toBe('available');
    expect(lessonStatus(true, 'l1', [], [], [{ lessonId: 'l1', completedAt: 1 }])).toBe(
      'completed',
    );
  });

  it('returns completed when every member card has a lesson-scoped exposure', () => {
    const cards = [
      makeCard({ id: 'a', deckId: 'd', state: 0 }),
      makeCard({ id: 'b', deckId: 'd', state: 0 }),
    ];
    expect(
      lessonStatus(
        true,
        'l1',
        cards,
        [
          { lessonId: 'l1', cardId: 'a', taughtAt: 1 },
          { lessonId: 'l1', cardId: 'b', taughtAt: 1 },
        ],
        [],
      ),
    ).toBe('completed');
  });

  it('returns available when at least one member lacks an exposure in this lesson', () => {
    const cards = [
      makeCard({ id: 'a', deckId: 'd', state: 2 }),
      makeCard({ id: 'b', deckId: 'd', state: 2 }),
    ];
    expect(
      lessonStatus(
        true,
        'l1',
        cards,
        [
          { lessonId: 'other', cardId: 'a', taughtAt: 1 },
          { lessonId: 'l1', cardId: 'b', taughtAt: 1 },
        ],
        [],
      ),
    ).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// buildPath
// ---------------------------------------------------------------------------

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

  it('places a checkpoint after the highest-orderIndex scoped lesson', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
    ];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1', lessonIds: ['l1', 'l2'] });
    const nodes = buildPath(course, lessons, [checkpoint], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'l2', 'cp1', 'l3']);
    const cpNode = nodes.find((n) => n.id === 'cp1');
    expect(cpNode?.nodeType).toBe('checkpoint');
    if (cpNode?.nodeType === 'checkpoint') {
      expect(cpNode.afterLessonId).toBe('l2');
    }
  });

  it('places a checkpoint with no lessonIds after the last lesson', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
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
      exposures: [{ lessonId: 'l1', cardId: 'a', taughtAt: 1 }],
      lessonCompletions: [],
      practiceMilestones: [],
    });
    const n1 = nodes.find((n) => n.id === 'l1');
    const n2 = nodes.find((n) => n.id === 'l2');
    if (n1?.nodeType === 'lesson') expect(n1.status).toBe('completed');
    if (n2?.nodeType === 'lesson') expect(n2.status).toBe('locked');
  });

  it('orders multiple checkpoints sharing a slot deterministically', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    ];
    const cp1 = makeExamDate({ id: 'cp1', courseId: 'c1', lessonIds: ['l1'] });
    const cp2 = makeExamDate({ id: 'cp2', courseId: 'c1', lessonIds: ['l1'] });
    const nodes = buildPath(course, lessons, [cp1, cp2], new Map());
    expect(nodes.map((n) => n.id)).toEqual(['l1', 'cp1', 'cp2', 'l2']);
  });
});

// ---------------------------------------------------------------------------
// buildPath — practice-node placement (addendum 2 §H, §K)
// ---------------------------------------------------------------------------

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
    const farNodes = buildPath(farCourse, lessons, [], new Map(), [], dueCardCount, 8, now);
    const nearNodes = buildPath(nearCourse, lessons, [], new Map(), [], dueCardCount, 8, now);
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
      const nodes = buildPath(course, fixtureLessons, [], new Map(), [], dueCardCount, 8, now);
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

// ---------------------------------------------------------------------------
// practiceGateAfterLesson
// ---------------------------------------------------------------------------

describe('practiceGateAfterLesson', () => {
  const lessons = [
    makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
    makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
  ];

  it('returns false when no manual practice node exists', () => {
    expect(practiceGateAfterLesson(lessons, [], 'l1')).toBe(false);
  });

  it('returns true when a manual node is placed immediately after the lesson', () => {
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    expect(practiceGateAfterLesson(lessons, [manual], 'l2')).toBe(true);
    // Not gating the other lessons.
    expect(practiceGateAfterLesson(lessons, [manual], 'l1')).toBe(false);
    expect(practiceGateAfterLesson(lessons, [manual], 'l3')).toBe(false);
  });

  it('ignores auto practice nodes — only manual nodes gate the ratchet', () => {
    const auto = makePracticeNode({ id: 'pn-auto', courseId: 'c1', type: 'auto', position: 1 });
    expect(practiceGateAfterLesson(lessons, [auto], 'l2')).toBe(false);
  });

  it('returns false for an unknown lesson id', () => {
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    expect(practiceGateAfterLesson(lessons, [manual], 'not-a-lesson')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pathPosition
// ---------------------------------------------------------------------------

describe('pathPosition', () => {
  it('counts non-extension lessons in the total', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
      makeLesson({ id: 'ext', courseId: 'c1', orderIndex: 2, isExtension: true }),
    ];
    const nodes = buildPath(course, lessons, [], new Map());
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(2); // extension excluded
  });

  it('counts completed and available lessons as reached, not locked ones', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
    const l1 = makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }); // first core -> available/completed
    const l2 = makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1, unlockedAt: 5 }); // available
    const l3 = makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }); // locked
    const lessons = [l1, l2, l3];
    const cardsById = new Map<string, Card[]>([
      ['l1', [makeCard({ id: 'a', deckId: 'd', state: 2 })]], // completed
    ]);
    const nodes = buildPath(course, lessons, [], cardsById, [], 0, 0, Date.now(), {
      exposures: [{ lessonId: 'l1', cardId: 'a', taughtAt: 1 }],
      lessonCompletions: [],
      practiceMilestones: [],
    });
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(3);
    expect(pos.reached).toBe(2); // l1 completed + l2 available; l3 locked
  });

  it('excludes checkpoint nodes from position counts', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
    const nodes = buildPath(course, lessons, [checkpoint], new Map());
    const pos = pathPosition(nodes);
    expect(pos.total).toBe(1);
    expect(pos.reached).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('KNOWN_NODE_TYPES', () => {
  it('contains lesson, checkpoint and practice types', () => {
    expect(KNOWN_NODE_TYPES).toContain('lesson');
    expect(KNOWN_NODE_TYPES).toContain('checkpoint');
    expect(KNOWN_NODE_TYPES).toContain('practice-auto');
    expect(KNOWN_NODE_TYPES).toContain('practice-manual');
  });

  it('every built path node has a known node type', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
    const nodes: PathNode[] = buildPath(course, lessons, [checkpoint], new Map());
    for (const node of nodes) {
      expect(KNOWN_NODE_TYPES).toContain(node.nodeType);
    }
  });
});

// ---------------------------------------------------------------------------
// nearestExamDate / examIsUrgent
// ---------------------------------------------------------------------------

describe('nearestExamDate', () => {
  it('returns course.examDate when there are no checkpoints', () => {
    const course = makeCourse({ id: 'c1', examDate: 10 * MS_PER_DAY });
    expect(nearestExamDate(course, [], 0)).toBe(10 * MS_PER_DAY);
  });

  it('returns the soonest future date across course.examDate and checkpoints', () => {
    const course = makeCourse({ id: 'c1', examDate: 20 * MS_PER_DAY });
    const checkpoints = [
      makeExamDate({ id: 'cp1', courseId: 'c1', examDate: 5 * MS_PER_DAY }),
      makeExamDate({ id: 'cp2', courseId: 'c1', examDate: 12 * MS_PER_DAY }),
    ];
    expect(nearestExamDate(course, checkpoints, 0)).toBe(5 * MS_PER_DAY);
  });

  it('ignores dates that have already passed', () => {
    const course = makeCourse({ id: 'c1', examDate: 20 * MS_PER_DAY });
    const checkpoints = [makeExamDate({ id: 'cp1', courseId: 'c1', examDate: 5 * MS_PER_DAY })];
    expect(nearestExamDate(course, checkpoints, 8 * MS_PER_DAY)).toBe(20 * MS_PER_DAY);
  });

  it('falls back to course.examDate even if it has already passed', () => {
    const course = makeCourse({ id: 'c1', examDate: 5 * MS_PER_DAY });
    expect(nearestExamDate(course, [], 8 * MS_PER_DAY)).toBe(5 * MS_PER_DAY);
  });
});

describe('examIsUrgent', () => {
  it('is false when the exam is in the past', () => {
    expect(examIsUrgent(5 * MS_PER_DAY, 8 * MS_PER_DAY)).toBe(false);
  });

  it('is false when the exam is further away than EXAM_URGENT_DAYS', () => {
    const now = 0;
    const nearestExam = now + (EXAM_URGENT_DAYS + 1) * MS_PER_DAY;
    expect(examIsUrgent(nearestExam, now)).toBe(false);
  });

  it('is true when the exam is within EXAM_URGENT_DAYS and still upcoming', () => {
    const now = 0;
    const nearestExam = now + (EXAM_URGENT_DAYS - 1) * MS_PER_DAY;
    expect(examIsUrgent(nearestExam, now)).toBe(true);
  });
});
