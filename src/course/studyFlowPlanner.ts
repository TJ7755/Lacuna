import type { CourseStudyFlowSnapshot } from './studyFlowSnapshot';

export type StudyFlowStep =
  | { kind: 'lesson'; lessonId: string; label: string }
  | { kind: 'practice'; nodeKey: string; mode: 'curricular' | 'recurring'; label: string }
  | { kind: 'exam-questions'; nodeKey: string; label: string };

export type StudyFlowDecision =
  | { kind: 'step'; step: StudyFlowStep }
  | { kind: 'blocked'; reason: 'archived' | 'curriculum-locked' }
  | { kind: 'complete' }
  | { kind: 'empty' };

/**
 * Chooses one step from the latest authoritative course snapshot. The caller
 * must rebuild the snapshot after each step rather than retaining a queue.
 */
export function planNextStudyStep(snapshot: CourseStudyFlowSnapshot): StudyFlowDecision {
  if (snapshot.archived) return { kind: 'blocked', reason: 'archived' };

  let hasCurriculum = false;
  let hasLockedLesson = false;
  for (const node of snapshot.nodes) {
    if (node.nodeType === 'lesson') {
      hasCurriculum = true;
      if (node.status === 'available') {
        return {
          kind: 'step',
          step: { kind: 'lesson', lessonId: node.id, label: node.lesson.name },
        };
      }
      if (node.status === 'locked') hasLockedLesson = true;
      continue;
    }

    if (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual') {
      hasCurriculum = true;
      const practice = snapshot.practiceByKey.get(node.nodeKey);
      if (practice?.active) {
        return {
          kind: 'step',
          step: {
            kind: 'practice',
            nodeKey: node.nodeKey,
            mode: 'curricular',
            label: practice.label,
          },
        };
      }
    }
  }

  if (hasLockedLesson) return { kind: 'blocked', reason: 'curriculum-locked' };
  if (snapshot.recurringPracticeEligibleCount > 0) {
    return {
      kind: 'step',
      step: { kind: 'practice', nodeKey: 'end', mode: 'recurring', label: 'Practice' },
    };
  }
  return hasCurriculum ? { kind: 'complete' } : { kind: 'empty' };
}
