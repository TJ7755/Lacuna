import type { Card, LegacyDeckRecord, SchedulerConfig } from '@lacuna/core/db/types';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';

export const NOW = new Date(2026, 5, 4, 12).getTime();

export function deck(id: string, days: number): LegacyDeckRecord {
  return {
    id,
    name: id,
    examDate: NOW + days * 24 * 60 * 60 * 1000,
    createdAt: NOW,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
}

/** A minimal SchedulerConfig standing in for a Course, keyed by courseId. */
export function course(id: string, days: number): SchedulerConfig {
  return {
    id,
    examDate: NOW + days * 24 * 60 * 60 * 1000,
    examObjective: 'expectedMarks',
    fsrsParameters: defaultFsrsParameters(),
  };
}

export function card(id: string, deckId: string, extra?: Partial<Card>): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId,
    schedulingUnitId: deckId,
    type: 'front_back',
    front: id,
    back: 'answer',
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
    createdAt: NOW,
    updatedAt: NOW,
    suspended: false,
    buriedUntil: null,
    ...extra,
  };
}
