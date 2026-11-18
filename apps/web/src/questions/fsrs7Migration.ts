import type { CourseRecord } from '@lacuna/core/db/types';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { replayQuestionSchedule } from '@lacuna/core/questions/scheduler';
import type { QuestionAttempt, QuestionDefinition } from '@lacuna/core/questions/types';

/** Rebuild only memory from complete receipts; retained due dates and counters are authoritative. */
export function migrateFsrs7Questions(
  questions: readonly QuestionDefinition[],
  attempts: readonly QuestionAttempt[],
  courses: readonly CourseRecord[],
): QuestionDefinition[] {
  const byQuestion = new Map<string, QuestionAttempt[]>();
  for (const attempt of attempts) {
    const rows = byQuestion.get(attempt.questionId) ?? [];
    rows.push(attempt);
    byQuestion.set(attempt.questionId, rows);
  }
  const parameters = new Map(courses.map((course) => [course.id, course.fsrsParameters]));
  return questions.map((question) => {
    const baseline = question.scheduleEpoch.baseline;
    const normalised = {
      ...question,
      stabilityFast: question.stabilityFast ?? null,
      scheduleEpoch: {
        ...question.scheduleEpoch,
        baseline:
          baseline.kind === 'legacy-opaque'
            ? {
                ...baseline,
                state: { ...baseline.state, stabilityFast: baseline.state.stabilityFast ?? null },
              }
            : baseline,
      },
    };
    if (normalised.stabilityFast !== null || question.reps === 0) return normalised;
    const evidence = (byQuestion.get(question.id) ?? []).filter(
      (attempt) =>
        attempt.scheduleEpochId === question.scheduleEpoch.id &&
        attempt.status === 'answered' &&
        attempt.answeredAt !== undefined &&
        attempt.undoneAt === undefined &&
        attempt.scheduleEffect.kind === 'replay' &&
        (question.scheduleEpoch.memoryOrigin === undefined ||
          attempt.answeredAt > (question.scheduleEpoch.memoryOrigin.lastReviewed ?? -Infinity)),
    );
    // An opaque baseline contributes counters, never an estimated fast trace. Its first
    // subsequent real answer initialises FSRS-7, provided the entire subsequent tail exists.
    const baselineReps =
      question.scheduleEpoch.memoryOrigin?.reps ??
      (baseline.kind === 'legacy-opaque' ? baseline.state.reps : 0);
    if (
      evidence.length === 0 ||
      evidence.length !== question.reps - baselineReps ||
      Math.max(...evidence.map((attempt) => attempt.answeredAt!)) !== question.lastReviewed
    ) {
      if (
        question.scheduleEpoch.memoryOrigin ||
        (baseline.kind === 'legacy-opaque' &&
          baseline.state.reps === question.reps &&
          baseline.state.lastReviewed === question.lastReviewed)
      )
        return normalised;
      const {
        stability,
        difficulty,
        lastReviewed,
        reps,
        lapses,
        state,
        due,
        scheduledDays,
        learningSteps,
      } = question;
      return {
        ...normalised,
        scheduleEpoch: {
          ...normalised.scheduleEpoch,
          memoryOrigin: {
            stability,
            stabilityFast: null,
            difficulty,
            lastReviewed,
            reps,
            lapses,
            state,
            due,
            scheduledDays,
            learningSteps,
          },
        },
      };
    }
    const replayed = replayQuestionSchedule(
      normalised,
      evidence,
      parameters.get(question.courseId) ?? defaultFsrsParameters(),
    );
    const state = {
      stability: replayed.stability,
      stabilityFast: replayed.stabilityFast,
      difficulty: replayed.difficulty,
      lastReviewed: question.lastReviewed,
      reps: question.reps,
      lapses: question.lapses,
      state: question.state,
      due: question.due,
      scheduledDays: question.scheduledDays,
      learningSteps: question.learningSteps,
    };
    return {
      ...normalised,
      ...state,
      scheduleEpoch: {
        ...normalised.scheduleEpoch,
        migrationCheckpoint: normalised.scheduleEpoch.migrationCheckpoint ?? {
          state,
          attemptIds: evidence.map((attempt) => attempt.id).sort(),
        },
      },
    };
  });
}
