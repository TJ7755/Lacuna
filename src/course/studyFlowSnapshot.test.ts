import { describe, expect, it } from 'vitest';
import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  PracticeNode,
} from '../db/types';
import { makeExamDateContext } from '../fsrs/examDate';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import { buildPath } from './path';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
  practicePrefixLessonIds,
} from './studyFlowSnapshot';

const NOW = 1_000_000;

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course',
    name: 'Course',
    description: '',
    createdAt: 0,
    examDate: NOW + 30 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 2,
    ...overrides,
  };
}

function lesson(id: string, orderIndex: number): Lesson {
  return { id, courseId: 'course', name: id, orderIndex, createdAt: 0, isExtension: false };
}

function card(id: string, lessonId: string): Card {
  return {
    id,
    deckId: 'deck',
    courseId: 'course',
    primaryLessonId: lessonId,
    type: 'front_back',
    front: id,
    back: id,
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
  };
}

function manual(id: string, position: number): PracticeNode {
  return { id, courseId: 'course', type: 'manual', position, name: id, createdAt: 0 };
}

function exposure(lessonId: string, cardId: string): LessonCardExposure {
  return { lessonId, cardId, taughtAt: NOW };
}

function assessment(id: string, examDate: number, afterLessonId: string): CourseAssessment {
  return {
    id,
    courseId: 'course',
    name: id,
    kind: 'final',
    examDate,
    afterLessonId,
    coverageMode: 'prefix',
    excludedCardIds: [],
    createdAt: 0,
  };
}

describe('buildCourseStudyFlowSnapshot', () => {
  it('averages review time once per backing deck', () => {
    const cards = [card('c1', 'l1'), { ...card('c2', 'l1'), deckId: 'other' }, card('c3', 'l1')];
    expect(
      courseMeanReviewSeconds(
        cards,
        new Map([
          ['deck', 10],
          ['other', 30],
        ]),
      ),
    ).toBe(20);
  });

  it('fixes curricular Practice scope to the lesson prefix', () => {
    const c = course();
    const lessons = [lesson('l1', 0), lesson('l2', 1)];
    const cards = [card('c1', 'l1'), card('c2', 'l2')];
    const nodes = buildPath(
      c,
      lessons,
      [],
      new Map([
        ['l1', [cards[0]]],
        ['l2', [cards[1]]],
      ]),
      [manual('p1', 0)],
    );
    expect([...practicePrefixLessonIds(nodes, 'p1')]).toEqual(['l1']);

    const snapshot = buildCourseStudyFlowSnapshot({
      course: c,
      nodes,
      cards,
      links: [],
      exposures: [exposure('l1', 'c1'), exposure('l2', 'c2')],
      examDateContext: makeExamDateContext(c, lessons, []),
      meanReviewSeconds: 600,
      now: NOW,
    });
    expect(snapshot.practiceByKey.get('p1')?.totalCount).toBe(1);
  });

  it('uses a fixed auto prefix only for its milestone and the reached scope for its session', () => {
    const c = course();
    const lessons = [lesson('l1', 0), lesson('l2', 1)];
    const cards = [card('c1', 'l1'), card('c2', 'l2')];
    const nodes = [
      { id: 'l1', nodeType: 'lesson' as const, lesson: lessons[0], status: 'completed' as const },
      {
        id: 'auto',
        nodeType: 'practice-auto' as const,
        afterLessonId: 'l1',
        nodeKey: 'auto',
      },
      { id: 'l2', nodeType: 'lesson' as const, lesson: lessons[1], status: 'available' as const },
    ];
    const snapshot = buildCourseStudyFlowSnapshot({
      course: c,
      nodes,
      cards,
      links: [],
      exposures: [exposure('l1', 'c1'), exposure('l2', 'c2')],
      examDateContext: makeExamDateContext(c, lessons, []),
      meanReviewSeconds: 600,
      now: NOW,
    });

    expect([...snapshot.practiceByKey.get('auto')!.scopeLessonIds]).toEqual(['l1']);
    expect([...snapshot.practiceByKey.get('auto')!.sessionScopeLessonIds]).toEqual(['l1', 'l2']);
    expect(snapshot.practiceByKey.get('auto')?.totalCount).toBe(1);
    expect(snapshot.practiceByKey.get('auto')?.eligibleCount).toBe(2);
  });

  it('honours an authored manual lesson scope for the live session', () => {
    const c = course();
    const lessons = [lesson('l1', 0), lesson('l2', 1)];
    const cards = [card('c1', 'l1'), card('c2', 'l2')];
    const node = { ...manual('p1', 0), lessonIds: ['l1'] };
    const nodes = buildPath(
      c,
      lessons,
      [],
      new Map([
        ['l1', [cards[0]]],
        ['l2', [cards[1]]],
      ]),
      [node],
    );
    const snapshot = buildCourseStudyFlowSnapshot({
      course: c,
      nodes,
      cards,
      links: [],
      exposures: [exposure('l1', 'c1'), exposure('l2', 'c2')],
      examDateContext: makeExamDateContext(c, lessons, []),
      meanReviewSeconds: 600,
      now: NOW,
    });

    expect([...snapshot.practiceByKey.get('p1')!.sessionScopeLessonIds]).toEqual(['l1']);
    expect(snapshot.practiceByKey.get('p1')?.eligibleCount).toBe(1);
  });

  it('keeps small manual workloads latent unless an intersecting assessment is urgent', () => {
    const lessons = [lesson('l1', 0)];
    const cards = [card('c1', 'l1')];
    const p = manual('p1', 0);
    const far = course();
    const farNodes = buildPath(far, lessons, [], new Map([['l1', cards]]), [p]);
    const common = {
      nodes: farNodes,
      cards,
      links: [],
      exposures: [exposure('l1', 'c1')],
      meanReviewSeconds: 30,
      practiceMilestones: [],
      now: NOW,
    };
    const farSnapshot = buildCourseStudyFlowSnapshot({
      ...common,
      course: far,
      examDateContext: makeExamDateContext(far, lessons, [assessment('far', far.examDate, 'l1')]),
    });
    expect(farSnapshot.practiceByKey.get('p1')?.active).toBe(false);

    const urgent = course({ examDate: NOW + MS_PER_DAY });
    const urgentAssessment = assessment('urgent', urgent.examDate, 'l1');
    const urgentSnapshot = buildCourseStudyFlowSnapshot({
      ...common,
      course: urgent,
      examDateContext: makeExamDateContext(urgent, lessons, [urgentAssessment]),
    });
    expect(urgentSnapshot.practiceByKey.get('p1')?.active).toBe(true);
  });

  it('never activates a manual Practice node with no eligible cards', () => {
    const c = course({ examDate: NOW + MS_PER_DAY });
    const lessons = [lesson('l1', 0)];
    const nodes = buildPath(c, lessons, [], new Map(), [manual('p1', 0)]);
    const snapshot = buildCourseStudyFlowSnapshot({
      course: c,
      nodes,
      cards: [],
      links: [],
      exposures: [],
      examDateContext: makeExamDateContext(c, lessons, []),
      meanReviewSeconds: 600,
      now: NOW,
    });
    expect(snapshot.practiceByKey.get('p1')?.active).toBe(false);
    expect(snapshot.activeManualNodeKeys.size).toBe(0);
  });

  it('uses the last reachable urgent checkpoint rather than one beyond a locked lesson', () => {
    const c = course({ unlockMode: 'semi-linear', examDate: NOW + MS_PER_DAY });
    const lessons = [lesson('l1', 0), lesson('l2', 1)];
    const cards = [card('c1', 'l1')];
    const taught = exposure('l1', 'c1');
    const nodes = buildPath(
      c,
      lessons,
      [],
      new Map([['l1', cards]]),
      [manual('p1', 0), manual('p2', 1)],
      0,
      0,
      NOW,
      { exposures: [taught], lessonCompletions: [], practiceMilestones: [] },
    );
    const urgentAssessment = assessment('urgent', c.examDate, 'l1');
    const snapshot = buildCourseStudyFlowSnapshot({
      course: c,
      nodes,
      cards,
      links: [],
      exposures: [taught],
      examDateContext: makeExamDateContext(c, lessons, [urgentAssessment]),
      meanReviewSeconds: 30,
      now: NOW,
    });

    expect(snapshot.practiceByKey.get('p1')?.active).toBe(true);
    expect(snapshot.practiceByKey.get('p2')?.active).toBe(false);
  });
});
