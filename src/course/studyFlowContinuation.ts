import type { SessionSummary } from '../components/learn/types';
import type { StudyFlowDecision, StudyFlowStep } from './studyFlowPlanner';

/** Whether a finished Practice step's summary could hand straight on to more Practice. */
export function mayContinueWithoutPause(
  completed: StudyFlowStep,
  summary: SessionSummary,
  breakPending: boolean,
): boolean {
  return (
    completed.kind === 'practice' &&
    completed.mode !== 'assessment' &&
    summary.reachedGoal &&
    !summary.limitReached &&
    !summary.timeLimitReached &&
    !summary.dailyGoalReached &&
    // A step that ended without a single answer must not chain into another one.
    summary.events.length > 0 &&
    !breakPending
  );
}

/**
 * Whether the study flow should move from a finished step straight into the next
 * without the full-screen hand-off. Only contiguous Practice continues: the step
 * cleared its work rather than stopping at a review goal or limit, no break is due,
 * and the planner's next step is ordinary Practice with no alternative to choose.
 * Lessons, assessments, breaks and the end of the flow keep their transition.
 */
export function continuesWithoutPause(
  completed: StudyFlowStep,
  summary: SessionSummary,
  next: StudyFlowDecision,
  breakPending: boolean,
): next is { kind: 'step'; step: Extract<StudyFlowStep, { kind: 'practice' }> } {
  return (
    mayContinueWithoutPause(completed, summary, breakPending) &&
    next.kind === 'step' &&
    next.step.kind === 'practice' &&
    next.step.mode !== 'assessment'
  );
}
