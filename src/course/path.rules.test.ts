import { describe, it, expect } from 'vitest';
import { lessonEffectiveReleaseDates, isLessonUnlocked, buildPath } from './path';
import { MS_PER_DAY } from '../fsrs/params';
import { makeCourse, makeLesson } from './path.testFixtures';

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

  it.each([
    { firstCreatedAt: 1, secondCreatedAt: 5 },
    { firstCreatedAt: 5, secondCreatedAt: 5 },
  ])(
    'semi-linear agrees with path order for tied lessons: %j',
    ({ firstCreatedAt, secondCreatedAt }) => {
      const course = makeCourse({ id: 'c1', unlockMode: 'semi-linear' });
      const first = makeLesson({
        id: 'la',
        courseId: 'c1',
        orderIndex: 0,
        createdAt: firstCreatedAt,
      });
      const second = makeLesson({
        id: 'lb',
        courseId: 'c1',
        orderIndex: 0,
        createdAt: secondCreatedAt,
      });
      const lessons = [second, first];
      const dates = lessonEffectiveReleaseDates(course, lessons);
      const path = buildPath(course, lessons, [], new Map(), [], 0, 0, 0);

      expect(
        path
          .filter((node) => node.nodeType === 'lesson' && node.status === 'available')
          .map((node) => node.id),
      ).toEqual([first.id]);
      expect(isLessonUnlocked(course, first, dates, lessons, 0)).toBe(true);
      expect(isLessonUnlocked(course, second, dates, lessons, 0)).toBe(false);
      expect(isLessonUnlocked(course, first, dates, [...lessons].reverse(), 0)).toBe(true);
    },
  );
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

describe('mid-course access', () => {
  const lessons = [0, 1, 2].map((orderIndex) =>
    makeLesson({ id: String(orderIndex), courseId: 'c', orderIndex }),
  );
  const course = makeCourse({ id: 'c', unlockMode: 'semi-linear', studyStartLessonId: '1' });

  it('opens the starting lesson and earlier catch-up lessons without completing them', () => {
    expect(lessons.map((lesson) => isLessonUnlocked(course, lesson, new Map(), lessons))).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      buildPath(course, lessons, [], new Map(), [], 0, 10).map(
        (node) => node.nodeType === 'lesson' && node.status,
      ),
    ).toEqual(['available', 'available', 'locked']);
  });

  it('retains dated release rules and falls back safely for a missing start', () => {
    const dated = {
      ...course,
      unlockMode: 'linear' as const,
      linearCadence: { anchorDate: 100, intervalDays: 7 },
    };
    expect(
      isLessonUnlocked(
        dated,
        lessons[1],
        lessonEffectiveReleaseDates(dated, lessons),
        lessons,
        100,
      ),
    ).toBe(false);
    expect(
      isLessonUnlocked(
        { ...course, studyStartLessonId: 'missing' },
        lessons[1],
        new Map(),
        lessons,
      ),
    ).toBe(false);
  });
});
