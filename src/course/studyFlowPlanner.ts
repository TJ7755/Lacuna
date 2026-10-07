import type { CourseStudyFlowSnapshot } from './studyFlowSnapshot';
import type { AssessmentPracticeOption } from './assessmentPractice';

export type StudyFlowStep =
  | { kind: 'lesson'; lessonId: string; label: string }
  | {
      kind: 'practice';
      nodeKey: string;
      mode: 'curricular' | 'recurring' | 'assessment';
      label: string;
      assessmentId?: string;
    }
  | { kind: 'exam-questions'; nodeKey: string; label: string };

export type StudyFlowDecision =
  | { kind: 'step'; step: StudyFlowStep }
  | { kind: 'choice'; step: StudyFlowStep; assessments: AssessmentPracticeOption[] }
  | { kind: 'blocked'; reason: 'archived' | 'curriculum-locked' }
  | { kind: 'complete' }
  | { kind: 'empty' };

/**
 * The one due-review step, whether the planner reaches it at the end of the curriculum
 * or the reader picks it from the study sheet: scheduled reviews due now that are not
 * yet secure for the exam (see courseDueReviewCards).
 */
export const DUE_REVIEW_STEP: Extract<StudyFlowStep, { kind: 'practice' }> = {
  kind: 'practice',
  nodeKey: 'due-review',
  mode: 'recurring',
  label: 'Review due cards',
};

/**
 * Chooses one step from the latest authoritative course snapshot. The caller
 * must rebuild the snapshot after each step rather than retaining a queue.
 */
export function planNextStudyStep(snapshot: CourseStudyFlowSnapshot): StudyFlowDecision {
  if (snapshot.archived) return { kind: 'blocked', reason: 'archived' };

  let hasCurriculum = false;
  let hasLockedLesson = false;
  let step: StudyFlowStep | undefined;
  for (const node of snapshot.nodes) {
    if (node.nodeType === 'lesson') {
      hasCurriculum = true;
      if (node.status === 'available') {
        step = { kind: 'lesson', lessonId: node.id, label: node.lesson.name };
        break;
      }
      if (node.status === 'locked') hasLockedLesson = true;
      continue;
    }

    if (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual') {
      hasCurriculum = true;
      const practice = snapshot.practiceByKey.get(node.nodeKey);
      if (practice?.active) {
        step = {
          kind: 'practice',
          nodeKey: node.nodeKey,
          mode: 'curricular',
          label: practice.label,
        };
        break;
      }
    }
  }

  if (step) {
    const assessments =
      step.kind === 'practice'
        ? (snapshot.practiceByKey.get(step.nodeKey)?.assessmentOptions ?? [])
        : snapshot.assessmentOptions;
    return assessments.length > 0 ? { kind: 'choice', step, assessments } : { kind: 'step', step };
  }

  if (hasLockedLesson) return { kind: 'blocked', reason: 'curriculum-locked' };
  if (snapshot.recurringPracticeEligibleCount > 0) {
    return snapshot.assessmentOptions.length > 0
      ? { kind: 'choice', step: DUE_REVIEW_STEP, assessments: snapshot.assessmentOptions }
      : { kind: 'step', step: DUE_REVIEW_STEP };
  }
  return hasCurriculum ? { kind: 'complete' } : { kind: 'empty' };
}
