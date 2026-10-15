import { describe, expect, it } from 'vitest';
import { courseBudgetedStudyPool, courseNewCardBudget } from './courseNewCardBudget';
import { MS_PER_DAY } from './params';
import type { Card, SchedulerConfig } from '../db/types';

const NOW = new Date('2026-06-04T10:00:00').getTime();

function makeCard(over: Partial<Card> & Pick<Card, 'id'>): Card {
  return {
    conceptId: `concept-${over.id}`,
    deckId: 'd1',
    schedulingUnitId: 'd1',
    courseId: 'course-a',
    type: 'front_back',
    front: 'q',
    back: 'a',
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
    updatedAt: 0,
    tags: [],
    suspended: false,
    buriedUntil: null,
    ...over,
  };
}

const config = (newCardsPerDay?: number): SchedulerConfig => ({
  id: 'course-a',
  examObjective: 'securedTopics',
  fsrsParameters: {
    w: [],
    requestRetention: 0.9,
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  newCardsPerDay,
});

const ids = (cards: Card[]) => cards.map((card) => card.id).sort();

describe('courseBudgetedStudyPool', () => {
  const lessonOne = [makeCard({ id: 'n1', createdAt: 1 }), makeCard({ id: 'n3', createdAt: 3 })];
  const lessonTwo = [makeCard({ id: 'n2', createdAt: 2 }), makeCard({ id: 'n4', createdAt: 4 })];

  it('admits only the course-wide oldest new cards across lesson units', () => {
    const budget = courseNewCardBudget([lessonOne, lessonTwo]);
    const pooled = [
      ...courseBudgetedStudyPool(lessonOne, config(2), NOW, budget),
      ...courseBudgetedStudyPool(lessonTwo, config(2), NOW, budget),
    ];
    // Per-unit studyPool would admit all four; the course cap is two.
    expect(ids(pooled)).toEqual(['n1', 'n2']);
  });

  it('counts a card shared by two units once towards the course cap', () => {
    const shared = makeCard({ id: 'shared', createdAt: 0 });
    const budget = courseNewCardBudget([
      [shared, ...lessonOne],
      [shared, ...lessonTwo],
    ]);
    expect(budget.cardsByCourse.get('course-a')).toHaveLength(5);
    expect(ids(courseBudgetedStudyPool([shared, ...lessonTwo], config(2), NOW, budget))).toEqual([
      'shared',
    ]);
  });

  it('keeps due reviews regardless of the new-card budget', () => {
    const review = makeCard({ id: 'r1', state: 2, due: NOW - MS_PER_DAY, reps: 3 });
    const budget = courseNewCardBudget([lessonOne, [review, ...lessonTwo]]);
    expect(ids(courseBudgetedStudyPool([review, ...lessonTwo], config(1), NOW, budget))).toEqual([
      'r1',
    ]);
  });

  it('leaves the unit pool unchanged when the course has no cap', () => {
    const budget = courseNewCardBudget([lessonOne, lessonTwo]);
    expect(ids(courseBudgetedStudyPool(lessonTwo, config(0), NOW, budget))).toEqual(['n2', 'n4']);
    expect(ids(courseBudgetedStudyPool(lessonTwo, config(), NOW, budget))).toEqual(['n2', 'n4']);
    expect(budget.admittedNew.size).toBe(0);
  });

  it('falls back to the unit budget for cards outside any course', () => {
    const loose = [
      makeCard({ id: 'l1', courseId: null, createdAt: 1 }),
      makeCard({ id: 'l2', courseId: null, createdAt: 2 }),
    ];
    const budget = courseNewCardBudget([loose]);
    expect(budget.cardsByCourse.size).toBe(0);
    expect(ids(courseBudgetedStudyPool(loose, config(1), NOW, budget))).toEqual(['l1']);
  });

  it('memoises the admitted set per course and cap', () => {
    const budget = courseNewCardBudget([lessonOne, lessonTwo]);
    courseBudgetedStudyPool(lessonOne, config(1), NOW, budget);
    courseBudgetedStudyPool(lessonTwo, config(3), NOW, budget);
    expect([...budget.admittedNew.keys()].sort()).toEqual(['course-a:1', 'course-a:3']);
    expect([...budget.admittedNew.get('course-a:3')!].sort()).toEqual(['n1', 'n2', 'n3']);
  });
});
