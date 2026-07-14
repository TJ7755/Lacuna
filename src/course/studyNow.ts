import type { PathNode } from './path';

export interface PracticeDispatchProgress {
  eligibleCount: number;
  completed: boolean;
}

export type StudyTarget =
  | { kind: 'lesson'; lessonId: string; label: string }
  | { kind: 'practice'; nodeKey: string; label: string }
  | { kind: 'practice-end'; label: string };

/** Selects the first actionable curricular node, then the recurring end fallback. */
export function nextStudyTarget(
  nodes: PathNode[],
  practiceProgress: ReadonlyMap<string, PracticeDispatchProgress>,
  endPracticeEligible: boolean,
): StudyTarget | null {
  for (const node of nodes) {
    if (node.nodeType === 'lesson' && node.status === 'available') {
      return { kind: 'lesson', lessonId: node.id, label: node.lesson.name };
    }

    if (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual') {
      const progress = practiceProgress.get(node.nodeKey);
      if (progress && !progress.completed && progress.eligibleCount > 0) {
        return {
          kind: 'practice',
          nodeKey: node.nodeKey,
          label: node.practiceNode?.name ?? 'Practice',
        };
      }
    }
  }

  return endPracticeEligible ? { kind: 'practice-end', label: 'Practice' } : null;
}
