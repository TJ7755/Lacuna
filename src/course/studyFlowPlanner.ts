import type { CourseStudyFlowSnapshot } from './studyFlowSnapshot';
import type { AssessmentPracticeOption } from './assessmentPractice';

export type StudyFlowStep =
  | { kind: 'lesson'; lessonId: string; label: string }
  | {
      kind: 'practice';
      nodeKey: string;
      mode: 'curricular' | 'recurring' | 'assessment' | 'exam';
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
 * Scheduled reviews lead the default session and can also be opened explicitly.
 */
export const DUE_REVIEW_STEP: Extract<StudyFlowStep, { kind: 'practice' }> = {
  kind: 'practice',
  nodeKey: 'due-review',
  mode: 'recurring',
  label: 'Review due cards',
};

export const EXAM_PRACTICE_STEP: Extract<StudyFlowStep, { kind: 'practice' }> = {
  kind: 'practice',
  nodeKey: 'exam-practice',
  mode: 'exam',
  label: 'Practise for exam',
};

/**
 * Chooses one step from the latest authoritative course snapshot. The caller
 * must rebuild the snapshot after each step rather than retaining a queue.
 */
export function planNextStudyStep(snapshot: CourseStudyFlowSnapshot): StudyFlowDecision {
  if (snapshot.archived) return { kind: 'blocked', reason: 'archived' };
  if (snapshot.recurringPracticeEligibleCount > 0) {
    return snapshot.assessmentOptions.length > 0
      ? { kind: 'choice', step: DUE_REVIEW_STEP, assessments: snapshot.assessmentOptions }
      : { kind: 'step', step: DUE_REVIEW_STEP };
  }

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
  return hasCurriculum || snapshot.cardCount > 0 ? { kind: 'complete' } : { kind: 'empty' };
}
