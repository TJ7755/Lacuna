import type { CourseStudyFlowSnapshot, StudyQuestionTarget } from './studyFlowSnapshot';
import type { AssessmentPracticeOption } from './assessmentPractice';
import { SCIENCE_TECHNIQUES } from '@lacuna/core/questions/techniqueTags';

/** An operational hand-off size, not a daily allowance or a learning-success threshold. */
export const STUDY_REVIEW_BLOCK_SIZE = 10;

export type StudyFlowStep =
  | { kind: 'lesson'; lessonId: string; label: string }
  | {
      kind: 'practice';
      nodeKey: string;
      mode: 'curricular' | 'recurring' | 'assessment' | 'exam' | 'catch-up';
      label: string;
      assessmentId?: string;
    }
  | (StudyQuestionTarget & {
      kind: 'exam-questions';
      nodeKey: string;
      label: string;
      scopeLessonIds?: string[];
      scopeConceptIds: string[];
      allowFamiliar?: boolean;
      reason?: string;
    });

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

export const CATCH_UP_STEP: Extract<StudyFlowStep, { kind: 'practice' }> = {
  kind: 'practice',
  nodeKey: 'catch-up',
  mode: 'catch-up',
  label: 'Review earlier material',
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
export function planNextStudyStep(
  snapshot: CourseStudyFlowSnapshot,
  allowCatchUp = true,
  previousStep?: StudyFlowStep | null,
): StudyFlowDecision {
  if (snapshot.archived) return { kind: 'blocked', reason: 'archived' };

  let hasCurriculum = false;
  let hasLockedLesson = false;
  let step: StudyFlowStep | undefined;
  const startIndex = snapshot.nodes.findIndex(
    (node) =>
      node.nodeType === 'lesson' &&
      !node.lesson.isExtension &&
      node.id === snapshot.studyStartLessonId,
  );
  for (const [index, node] of snapshot.nodes.entries()) {
    if (node.nodeType === 'lesson') {
      if (snapshot.priorKnowledgeLessonIds.has(node.id)) continue;
      // Optional extensions before the chosen entry stay optional, independently of core coverage.
      if (node.lesson.isExtension && index < startIndex) continue;
      hasCurriculum = true;
      if (node.status === 'available') {
        step = { kind: 'lesson', lessonId: node.id, label: node.lesson.name };
        break;
      }
      if (node.status === 'locked') hasLockedLesson = true;
      continue;
    }

    if (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual') {
      if (
        snapshot.priorKnowledgeLessonIds.size > 0 &&
        (!node.afterLessonId || snapshot.priorKnowledgeLessonIds.has(node.afterLessonId))
      )
        continue;
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

  const question = snapshot.questionOptions?.[0];
  const questionStep: StudyFlowStep | undefined = question
    ? {
        kind: 'exam-questions',
        nodeKey: question.techniqueId
          ? `questions-technique-${question.techniqueId}`
          : `questions-${question.conceptId}`,
        ...(question.techniqueId
          ? { techniqueId: question.techniqueId }
          : { conceptId: question.conceptId }),
        scopeLessonIds: snapshot.questionScopeLessonIds,
        scopeConceptIds: snapshot.questionScopeConceptIds ?? [],
        label: question.unfinished ? `Resume: ${question.name}` : `Practise: ${question.name}`,
        reason: question.needs?.techniques.length
          ? `Practise: ${question.needs.techniques.map((id) => SCIENCE_TECHNIQUES.find((skill) => skill.id === id)?.name ?? id).join(', ')}.`
          : question.needs?.knowledge
            ? 'Check your understanding after reviewing the notes.'
            : question.needs?.application
              ? 'Apply your knowledge to an exam question.'
              : undefined,
      }
    : undefined;
  const repair = question?.repairLessonId;
  if (questionStep && question?.unfinished) return { kind: 'step', step: questionStep };
  if (repair && !(previousStep?.kind === 'lesson' && previousStep.lessonId === repair)) {
    const lesson = snapshot.nodes.find(
      (node) => node.nodeType === 'lesson' && node.id === repair && node.status !== 'locked',
    );
    if (lesson?.nodeType === 'lesson')
      return {
        kind: 'step',
        step: { kind: 'lesson', lessonId: repair, label: `Review ${lesson.lesson.name}` },
      };
  }
  if (questionStep && repair && previousStep?.kind === 'lesson')
    return { kind: 'step', step: questionStep };
  if (previousStep?.kind === 'practice') {
    if (questionStep) return { kind: 'step', step: questionStep };
    if (step?.kind === 'lesson') return { kind: 'step', step };
  }
  if (snapshot.recurringPracticeEligibleCount > 0) return { kind: 'step', step: DUE_REVIEW_STEP };
  // An available Question or exam date is not evidence that an untouched course was taught.
  if (snapshot.hasStudyHistory === false && step?.kind === 'lesson') return { kind: 'step', step };
  const assessment = snapshot.assessmentOptions[0];
  const assessmentStep: StudyFlowStep | undefined = assessment
    ? {
        kind: 'practice',
        nodeKey: `assessment-${assessment.assessmentId}`,
        mode: 'assessment',
        assessmentId: assessment.assessmentId,
        label: `Prepare for ${assessment.name}`,
      }
    : snapshot.examPracticeEligibleCount > 0 && !step
      ? EXAM_PRACTICE_STEP
      : undefined;
  if (assessmentStep && previousStep?.kind !== 'practice')
    return { kind: 'step', step: assessmentStep };
  if (questionStep && previousStep?.kind !== 'exam-questions')
    return { kind: 'step', step: questionStep };
  if (step) return { kind: 'step', step };
  if (assessmentStep) return { kind: 'step', step: assessmentStep };
  if (questionStep) return { kind: 'step', step: questionStep };

  if (allowCatchUp && (snapshot.catchUpEligibleCount ?? 0) > 0)
    return { kind: 'step', step: CATCH_UP_STEP };
  if (hasLockedLesson) return { kind: 'blocked', reason: 'curriculum-locked' };
  return hasCurriculum || snapshot.cardCount > 0 ? { kind: 'complete' } : { kind: 'empty' };
}
