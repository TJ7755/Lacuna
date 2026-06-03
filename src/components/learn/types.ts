import type { Grade } from '../../db/types';

/** A single answered card within a Learn session, retained for the end report. */
export interface SessionEvent {
  grade: Grade;
  correct: boolean;
  responseTimeSec: number;
  distracted: boolean;
}

/** Aggregated outcome of a Learn session, shown in the report. */
export interface SessionSummary {
  events: SessionEvent[];
  masteryBefore: number;
  masteryAfter: number;
  focusFraction: number;
  reachedGoal: boolean;
}
