import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../components/learn/types';
import type { StudyFlowDecision, StudyFlowStep } from './studyFlowPlanner';
import { continuesWithoutPause } from './studyFlowContinuation';

const practice = (nodeKey: string): StudyFlowStep => ({
  kind: 'practice',
  nodeKey,
  mode: 'curricular',
  label: 'Practice',
});
const summary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  events: [{ grade: 3, correct: true, responseTimeSec: 4, distracted: false }],
  masteryBefore: 0.4,
  masteryAfter: 0.5,
  objectiveLabel: 'Predicted recall',
  focusFraction: 1,
  reachedGoal: true,
  limitReached: false,
  ...overrides,
});
const next: StudyFlowDecision = { kind: 'step', step: practice('practice-2') };

describe('continuesWithoutPause', () => {
  it('continues contiguous Practice after its work is cleared', () => {
    expect(continuesWithoutPause(practice('practice-1'), summary(), next, false)).toBe(true);
  });

  it('keeps the hand-off at a goal, a limit, a break or an exit', () => {
    const done = practice('practice-1');
    expect(continuesWithoutPause(done, summary({ dailyGoalReached: true }), next, false)).toBe(false);
    expect(continuesWithoutPause(done, summary({ limitReached: true }), next, false)).toBe(false);
    expect(continuesWithoutPause(done, summary({ timeLimitReached: true }), next, false)).toBe(false);
    expect(continuesWithoutPause(done, summary({ reachedGoal: false }), next, false)).toBe(false);
    expect(continuesWithoutPause(done, summary(), next, true)).toBe(false);
  });

  it('never chains a step that ended without an answer', () => {
    expect(continuesWithoutPause(practice('practice-1'), summary({ events: [] }), next, false)).toBe(
      false,
    );
  });

  it('keeps the hand-off before lessons, assessments, choices and the end of the flow', () => {
    const done = practice('practice-1');
    const lesson: StudyFlowDecision = {
      kind: 'step',
      step: { kind: 'lesson', lessonId: 'l', label: 'Lesson 2' },
    };
    const assessment: StudyFlowDecision = {
      kind: 'step',
      step: { ...practice('a'), mode: 'assessment', assessmentId: 'a' } as StudyFlowStep,
    };
    const choice: StudyFlowDecision = { kind: 'choice', step: practice('p'), assessments: [] };
    for (const decision of [lesson, assessment, choice, { kind: 'complete' } as const]) {
      expect(continuesWithoutPause(done, summary(), decision, false)).toBe(false);
    }
    const lessonDone: StudyFlowStep = { kind: 'lesson', lessonId: 'l', label: 'Lesson 1' };
    expect(continuesWithoutPause(lessonDone, summary(), next, false)).toBe(false);
  });
});
