import type { Card } from '@lacuna/core/db/types';
import { stampUpdatedAt } from './mutationStamp';

type NewCardFields = Pick<
  Card,
  | 'id'
  | 'conceptId'
  | 'deckId'
  | 'schedulingUnitId'
  | 'courseId'
  | 'primaryLessonId'
  | 'type'
  | 'front'
  | 'back'
  | 'payload'
  | 'answerMode'
  | 'requireCorrectSpelling'
  | 'tags'
  | 'createdAt'
  | 'sequenceItemId'
  | 'occlusionRegionId'
>;

/** Callers own identity and scope; every new card starts with fresh scheduling state. */
export function newCard(fields: NewCardFields): Card {
  return stampUpdatedAt(
    {
      ...fields,
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
      tags: fields.tags ?? [],
      suspended: false,
      buriedUntil: null,
    },
    fields.createdAt,
  );
}
