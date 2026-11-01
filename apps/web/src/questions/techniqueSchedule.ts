import { gradeQuestionAttempt } from './grading';
import { isUpcomingExamDate } from '../fsrs/examDate';
import { exposedQuestions } from './questionExposure';
import type { FsrsParameters } from '@lacuna/core/db/types';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { forgettingCurve } from '../fsrs/forwardSim';
import { decayOf } from '../fsrs/fsrs';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetQuestion } from '@lacuna/core/questions/questionSets';
import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';
import type { QuestionScheduleState } from '@lacuna/core/questions/types';
import { questionPresentationFingerprint } from './generators/declarative';
import { emptyQuestionSchedule, scheduleQuestionReview } from './scheduler';

function nodes(question: QuestionSetQuestion) {
  return [
    { id: question.id, answer: question.answer },
    ...question.parts.flatMap((part) => [
      { id: part.id, answer: part.answer },
      ...part.subparts.map((subpart) => ({ id: subpart.id, answer: subpart.answer })),
    ]),
  ];
}

export function questionTechniqueIds(question: QuestionSetQuestion): TechniqueId[] {
  return [
    ...new Set(
      nodes(question).flatMap(({ answer }) =>
        (answer?.allocations ?? []).flatMap((allocation) =>
          allocation.dimension !== 'knowledge' &&
          allocation.techniqueTags?.provenance.source === 'author'
            ? allocation.techniqueTags.techniqueIds
            : [],
        ),
      ),
    ),
  ];
}

/** Replay independent first answers; repeated presentations never manufacture stability. */
export function deriveTechniqueSchedules(
  attempts: readonly QuestionSetAttemptRecord[],
): Map<TechniqueId, QuestionScheduleState> {
  const schedules = new Map<TechniqueId, QuestionScheduleState>();
  const seen = new Set<string>();
  const firstExposure = new Map<string, string>();
  for (const attempt of [...attempts].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )) {
    for (const question of exposedQuestions(attempt)) {
      const fingerprint = questionPresentationFingerprint(question);
      if (!firstExposure.has(fingerprint)) firstExposure.set(fingerprint, attempt.id);
    }
  }
  const events = attempts
    .flatMap((attempt) => (attempt.firstMarking ?? []).map((snapshot) => ({ attempt, snapshot })))
    .sort(
      (a, b) =>
        a.snapshot.recordedAt - b.snapshot.recordedAt ||
        a.attempt.id.localeCompare(b.attempt.id) ||
        a.snapshot.questionId.localeCompare(b.snapshot.questionId),
    );
  for (const { attempt, snapshot } of events) {
    if (attempt.mode !== 'practice' || attempt.undoneAt !== undefined) continue;
    const question = attempt.receipt.questions.find((row) => row.id === snapshot.questionId);
    if (!question) continue;
    const fingerprint = questionPresentationFingerprint(question);
    if (seen.has(fingerprint) || firstExposure.get(fingerprint) !== attempt.id) continue;
    seen.add(fingerprint);
    const answers = nodes(question);
    if (
      attempt.disputedQuestionIds?.includes(question.id) ||
      attempt.firstMarkingConflicts?.some((row) => row.questionId === question.id) ||
      attempt.assistance.some(
        (event) =>
          answers.some((node) => node.id === event.nodeId) &&
          event.occurredAt <= snapshot.recordedAt,
      )
    )
      continue;
    const decisions = new Map(snapshot.decisions.map((row) => [row.allocationId, row]));
    for (const technique of questionTechniqueIds(question)) {
      let earned = 0;
      let available = 0;
      let resolved = true;
      for (const { answer } of answers)
        for (const allocation of answer?.allocations ?? []) {
          if (
            allocation.dimension === 'knowledge' ||
            allocation.techniqueTags?.provenance.source !== 'author' ||
            !allocation.techniqueTags.techniqueIds.includes(technique)
          )
            continue;
          const decision = decisions.get(allocation.id);
          available += allocation.maxMarks;
          if (
            decision?.status !== 'awarded' ||
            !Number.isSafeInteger(allocation.maxMarks) ||
            !Number.isSafeInteger(decision.marks) ||
            decision.marks < 0 ||
            decision.marks > allocation.maxMarks
          )
            resolved = false;
          else earned += decision.marks;
        }
      if (!resolved || available <= 0) continue;
      const grade =
        snapshot.gradeMappingVersion === 'full-good-otherwise-again-v1'
          ? earned === available
            ? 3
            : 1
          : gradeQuestionAttempt({
              marksEarned: earned,
              marksAvailable: available,
              hasUndeterminedVerdict: !resolved,
              hasUnresolvedDispute: false,
            });
      if (grade === null) continue;
      schedules.set(
        technique,
        scheduleQuestionReview(
          schedules.get(technique) ?? emptyQuestionSchedule(),
          grade,
          snapshot.schedulerConfig,
          snapshot.recordedAt,
        ).schedule,
      );
    }
  }
  return schedules;
}

/** A projection only: reading readiness never changes the memory state. */
export function techniquePracticeStatus(
  schedule: QuestionScheduleState,
  params: FsrsParameters,
  now: number,
  examDate?: number,
) {
  const target = isUpcomingExamDate(examDate, now) ? examDate : undefined;
  const estimatedRecall =
    schedule.stability !== null && schedule.lastReviewed !== null
      ? forgettingCurve(
          ((target ?? now) - schedule.lastReviewed) / MS_PER_DAY,
          schedule.stability,
          decayOf(params),
        )
      : null;
  const dueAt = schedule.due;
  return { dueAt, due: dueAt === null || dueAt <= now, estimatedRecall };
}
