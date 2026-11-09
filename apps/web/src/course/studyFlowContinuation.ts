import type { SessionSummary } from './sessionSummary';
import type { StudyFlowDecision, StudyFlowStep } from './studyFlowPlanner';

/** Whether a finished Practice step's summary could hand straight on to more Practice. */
export function mayContinueWithoutPause(
  completed: StudyFlowStep,
  summary: SessionSummary,
  pauseAfterBlock: boolean,
): boolean {
  return (
    completed.kind === 'practice' &&
    completed.mode !== 'assessment' &&
    (summary.reachedGoal || summary.blockComplete === true) &&
    !summary.limitReached &&
    !summary.timeLimitReached &&
    !summary.dailyGoalReached &&
    // A step that ended without a single answer must not chain into another one.
    summary.events.length > 0 &&
    !pauseAfterBlock
  );
}

/**
 * Whether the study flow should move from a finished step straight into the next
 * without the full-screen hand-off. Contiguous card practice can continue after
 * a review block or an exhausted pool. The next step must be ordinary Practice
 * with no alternative to choose, and no break, daily goal or limit may be due.
 * Lessons, assessments, breaks and the end of the flow keep their transition.
 */
export function continuesWithoutPause(
  completed: StudyFlowStep,
  summary: SessionSummary,
  next: StudyFlowDecision,
  pauseAfterBlock: boolean,
): next is { kind: 'step'; step: Extract<StudyFlowStep, { kind: 'practice' }> } {
  return (
    mayContinueWithoutPause(completed, summary, pauseAfterBlock) &&
    next.kind === 'step' &&
    next.step.kind === 'practice' &&
    next.step.mode !== 'assessment' &&
    !(
      completed.kind === 'practice' &&
      completed.mode === 'catch-up' &&
      next.step.mode === 'catch-up'
    )
  );
}
