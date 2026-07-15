import { describe, expect, it } from 'vitest';
import type {
  Card,
  Course,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  PracticeNode,
} from '../db/types';
import { makeExamDateContext } from '../fsrs/examDate';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import {
  eligiblePracticePool,
  lessonCardMembership,
  lessonStudyPool,
  practiceCardScope,
  practiceNodeKey,
  practiceReadiness,
  practiceScopeVersion,
} from './studyPools';

const NOW = 10 * MS_PER_DAY;

function makeCard(id: string, primaryLessonId: string | null, overrides: Partial<Card> = {}): Card {
  return {
    id,
    deckId: 'course',
    courseId: 'course',
    primaryLessonId,
    type: 'front_back',
    front: id,
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

function makeCourse(): Course {
  return {
    id: 'course',
    name: 'Course',
    description: '',
    createdAt: 0,
    examDate: NOW + 30 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'securedTopics',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 2,
  };
}

function makeLesson(id: string, examDate?: number): Lesson {
  return {
    id,
    courseId: 'course',
    name: id,
    orderIndex: Number(id.slice(1)),
    createdAt: 0,
    isExtension: false,
    examDate,
  };
}

const link = (lessonId: string, cardId: string): LessonCardLink => ({
  id: `${lessonId}-${cardId}`,
  lessonId,
  cardId,
  createdAt: 0,
});
const exposure = (lessonId: string, cardId: string): LessonCardExposure => ({
  lessonId,
  cardId,
  taughtAt: NOW,
});

describe('lesson pools', () => {
  it('deduplicates primary and linked lesson membership', () => {
    const cards = [makeCard('a', 'l1'), makeCard('b', 'l2')];
    expect(
      lessonCardMembership('l1', cards, [link('l1', 'a'), link('l1', 'b')]).map((c) => c.id),
    ).toEqual(['a', 'b']);
  });

  it('excludes only exposures for this lesson', () => {
    const cards = [makeCard('linked', 'l2')];
    const links = [link('l1', 'linked')];
    expect(lessonStudyPool('l1', cards, links, [exposure('l2', 'linked')])).toEqual(cards);
    expect(lessonStudyPool('l1', cards, links, [exposure('l1', 'linked')])).toEqual([]);
  });
});

describe('practice pools', () => {
  it('requires both reached membership and an exposure somewhere', () => {
    const cards = [makeCard('primary', 'l1'), makeCard('linked', 'l3'), makeCard('unseen', 'l1')];
    const scope = practiceCardScope(
      cards,
      [link('l1', 'linked')],
      [exposure('l1', 'primary'), exposure('l3', 'linked')],
      { reachedLessonIds: new Set(['l1']) },
      NOW,
    );
    expect(scope.map((card) => card.id)).toEqual(['primary', 'linked']);
  });

  it('honours a manual lesson scope, AND filters, stable randomisation and card limit', () => {
    const cards = [
      makeCard('a', 'l1', { due: NOW - 1, flagged: true }),
      makeCard('b', 'l1', { due: NOW - 1, flagged: true }),
      makeCard('c', 'l1', { due: NOW + 1, flagged: true }),
      makeCard('d', 'l2', { due: NOW - 1, flagged: true }),
    ];
    const node: PracticeNode = {
      id: 'manual',
      courseId: 'course',
      type: 'manual',
      position: 1,
      name: 'Manual',
      lessonIds: ['l1'],
      filters: ['due', 'flagged'],
      cardCount: 1,
      randomize: true,
      createdAt: 0,
    };
    const args = [
      cards,
      [] as LessonCardLink[],
      cards.map((card) => exposure('l1', card.id)),
      { reachedLessonIds: new Set(['l1', 'l2']), practiceNode: node },
      NOW,
    ] as const;
    const first = practiceCardScope(...args);
    const second = practiceCardScope(...args);
    expect(first).toHaveLength(1);
    expect(['a', 'b']).toContain(first[0].id);
    expect(second.map((card) => card.id)).toEqual(first.map((card) => card.id));
  });

  it('filters unavailable and mastered cards at each card primary lesson horizon', () => {
    const course = makeCourse();
    const near = makeLesson('l1', NOW + MS_PER_DAY);
    const far = makeLesson('l2', NOW + 100 * MS_PER_DAY);
    const reviewed = { stability: 30, lastReviewed: NOW, state: 2 as const };
    const nearCard = makeCard('near', 'l1', reviewed);
    const farCard = makeCard('far', 'l2', reviewed);
    const suspended = makeCard('suspended', 'l1', { suspended: true });
    const context = makeExamDateContext(course, [near, far], []);
    expect(
      eligiblePracticePool([nearCard, farCard, suspended], course, context, NOW).map(
        (card) => card.id,
      ),
    ).toEqual(['far']);
  });

  it('keeps a linked card horizon anchored to its primary lesson', () => {
    const course = makeCourse();
    const linkedIntoNearLesson = makeCard('linked', 'l2', {
      stability: 30,
      lastReviewed: NOW,
      state: 2,
    });
    const context = makeExamDateContext(
      course,
      [makeLesson('l1', NOW + MS_PER_DAY), makeLesson('l2', NOW + 100 * MS_PER_DAY)],
      [],
    );
    const scope = practiceCardScope(
      [linkedIntoNearLesson],
      [link('l1', 'linked')],
      [exposure('l1', 'linked')],
      { reachedLessonIds: new Set(['l1']) },
      NOW,
    );
    expect(eligiblePracticePool(scope, course, context, NOW).map((card) => card.id)).toEqual([
      'linked',
    ]);
  });

  it('measures readiness over the full scope, including unavailable cards', () => {
    const course = makeCourse();
    const lesson = makeLesson('l1', NOW + MS_PER_DAY);
    const securedSuspended = makeCard('secured', 'l1', {
      stability: 30,
      lastReviewed: NOW,
      state: 2,
      suspended: true,
    });
    const weak = makeCard('weak', 'l1');
    const context = makeExamDateContext(course, [lesson], []);
    expect(practiceReadiness([securedSuspended, weak], course, context, NOW)).toEqual({
      securedCardCount: 1,
      totalCardCount: 2,
      fraction: 0.5,
    });
  });
});

describe('practice milestone identity', () => {
  it('uses the persisted id for manual nodes and course plus lesson for auto nodes', () => {
    expect(practiceNodeKey('course', { id: 'manual', type: 'manual' }, 'l1')).toBe('manual');
    expect(practiceNodeKey('course', undefined, 'l1')).toBe('practice-auto-course-l1');
  });

  it('fingerprints the card set independently of input order', () => {
    const a = makeCard('a', 'l1');
    const b = makeCard('b', 'l1');
    expect(practiceScopeVersion([a, b])).toBe(practiceScopeVersion([b, a]));
    expect(practiceScopeVersion([a])).not.toBe(practiceScopeVersion([a, b]));
  });
});
