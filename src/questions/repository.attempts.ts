import { db, makeId } from '../db/schema';
import type { CheckerDisputeReport, Grade, LineVerdict } from '../db/types';
import { validateQuestionAttempt } from './domain';
import { gradeQuestionAttempt } from './grading';
import { questionGeneratorRegistry } from './generators';
import { jsonEqual, requireQuestionPayload } from './repository.shared';
import { replayQuestionSchedule, scheduleQuestionReview } from './scheduler';
import {
  QUESTION_GRADE_MAPPING_VERSION,
  type QuestionAttempt,
  type QuestionCorrection,
  type QuestionDefinition,
  type ResolvedQuestionInstance,
} from './types';

export interface StartQuestionAttemptInput {
  questionId: string;
  sessionId: string;
  instance?: ResolvedQuestionInstance;
  attemptId?: string;
  now?: number;
}

function resolvedInstanceFor(
  question: QuestionDefinition,
  instance: ResolvedQuestionInstance | undefined,
): ResolvedQuestionInstance {
  if (question.kind === 'fixed') {
    if (instance) throw new Error('A fixed Question cannot replace its authored receipt.');
    return {
      renderedPrompt: question.prompt,
      resolvedPayload: question.payload,
      renderedExplanation: question.explanation,
    };
  }
  if (!instance) throw new Error('A generated Question must be resolved before it is shown.');
  if (
    instance.generatorKey !== question.generatorKey ||
    instance.generatorVersion !== question.generatorVersion ||
    !instance.seed?.trim() ||
    !instance.generatorFingerprint?.trim()
  ) {
    throw new Error('The generated Question receipt does not match its definition.');
  }
  const regenerated = questionGeneratorRegistry.resolve({
    generatorKey: question.generatorKey,
    generatorVersion: question.generatorVersion,
    configuration: question.generatorConfig,
    seed: instance.seed,
  });
  if (!jsonEqual(instance, regenerated)) {
    throw new Error('The generated Question receipt does not match its definition.');
  }
  return regenerated;
}

export async function startQuestionAttempt(
  input: StartQuestionAttemptInput,
): Promise<QuestionAttempt> {
  const now = input.now ?? Date.now();
  return db.transaction('rw', [db.questions, db.questionAttempts], async () => {
    const question = await db.questions.get(input.questionId);
    if (!question) throw new Error('Question not found.');
    if (question.suspended) throw new Error('A suspended Question cannot be started.');
    const instance = resolvedInstanceFor(question, input.instance);
    requireQuestionPayload(instance.resolvedPayload);
    if (!instance.renderedPrompt.trim() || !instance.renderedExplanation.trim()) {
      throw new Error('A Question receipt requires a prompt and worked explanation.');
    }
    const id = input.attemptId ?? makeId();
    const existing = await db.questionAttempts.get(id);
    if (existing) {
      if (existing.questionId !== question.id || existing.sessionId !== input.sessionId) {
        throw new Error(`Question attempt ${id} belongs to another presentation.`);
      }
      return existing;
    }
    const attempt: QuestionAttempt = {
      id,
      questionId: question.id,
      courseId: question.courseId,
      contentVersion: question.contentVersion,
      contentRevisionId: question.contentRevisionId,
      scheduleEpochId: question.scheduleEpoch.id,
      purpose: 'post-instruction',
      shownAt: now,
      updatedAt: now,
      status: 'shown',
      receiptOrigin: 'native',
      renderedPrompt: instance.renderedPrompt,
      resolvedPayload: instance.resolvedPayload,
      renderedExplanation: instance.renderedExplanation,
      generatorKey: instance.generatorKey,
      generatorVersion: instance.generatorVersion,
      seed: instance.seed,
      parameters: instance.parameters,
      generatorFingerprint: instance.generatorFingerprint,
      scheduleEffect: { kind: 'none' },
      sessionId: input.sessionId,
    };
    validateQuestionAttempt(attempt);
    await db.questionAttempts.add(attempt);
    return attempt;
  });
}

export interface AnswerQuestionAttemptInput {
  attemptId: string;
  submittedAnswer: string | string[];
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
  responseTimeSeconds?: number;
  now?: number;
}

export interface AnswerQuestionAttemptResult {
  attempt: QuestionAttempt;
  question: QuestionDefinition;
  recorded: boolean;
}

function answersEqual(left: string | string[] | undefined, right: string | string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function answerQuestionAttempt(
  input: AnswerQuestionAttemptInput,
): Promise<AnswerQuestionAttemptResult> {
  const now = input.now ?? Date.now();
  return db.transaction('rw', [db.courses, db.questions, db.questionAttempts], async () => {
    const attempt = await db.questionAttempts.get(input.attemptId);
    if (!attempt) throw new Error('Question attempt not found.');
    const question = await db.questions.get(attempt.questionId);
    if (!question) throw new Error('Question not found.');
    if (attempt.status === 'answered') {
      if (
        !answersEqual(attempt.submittedAnswer, input.submittedAnswer) ||
        attempt.marksEarned !== input.marksEarned ||
        attempt.marksAvailable !== input.marksAvailable
      ) {
        throw new Error('A Question first submission is immutable.');
      }
      return { attempt, question, recorded: false };
    }
    if (attempt.status !== 'shown') throw new Error('An abandoned attempt cannot be answered.');
    if (
      !Number.isSafeInteger(input.marksEarned) ||
      !Number.isSafeInteger(input.marksAvailable) ||
      input.marksAvailable <= 0 ||
      input.marksEarned < 0 ||
      input.marksEarned > input.marksAvailable
    ) {
      throw new Error('Question submission marks are invalid.');
    }
    if (
      input.responseTimeSeconds !== undefined &&
      (!Number.isFinite(input.responseTimeSeconds) || input.responseTimeSeconds < 0)
    ) {
      throw new Error('Question response time must be a non-negative number.');
    }

    const grade = gradeQuestionAttempt({
      marksEarned: input.marksEarned,
      marksAvailable: input.marksAvailable,
      hasUndeterminedVerdict: input.lineVerdicts?.some((line) => line.undetermined) ?? false,
      hasUnresolvedDispute: (input.checkerDisputes?.length ?? 0) > 0,
    });
    let scheduledQuestion = question;
    let scheduling: (ReturnType<typeof scheduleQuestionReview> & { grade: Grade }) | undefined;
    if (grade !== null && attempt.scheduleEpochId === question.scheduleEpoch.id) {
      const course = await db.courses.get(question.courseId);
      if (!course) throw new Error('Question Course not found.');
      scheduling = {
        ...scheduleQuestionReview(question, grade, course.fsrsParameters, now),
        grade,
      };
      scheduledQuestion = {
        ...question,
        ...scheduling.schedule,
        scheduleUpdatedAt: now,
        updatedAt: now,
      };
    }
    const answered: QuestionAttempt = {
      ...attempt,
      status: 'answered',
      answeredAt: now,
      updatedAt: now,
      submittedAnswer: input.submittedAnswer,
      marksEarned: input.marksEarned,
      marksAvailable: input.marksAvailable,
      lineVerdicts: input.lineVerdicts,
      checkerDisputes: input.checkerDisputes,
      responseTimeSeconds: input.responseTimeSeconds,
      ...(grade === null ? {} : { grade }),
      ...(scheduling
        ? {
            retrievabilityAtAttempt: scheduling.retrievabilityAtAttempt,
            scheduleEffect: { kind: 'replay', grade: scheduling.grade } as const,
            schedulerVersion: scheduling.schedulerVersion,
            gradeMappingVersion: QUESTION_GRADE_MAPPING_VERSION,
            schedulerConfigFingerprint: scheduling.schedulerConfigFingerprint,
            schedulerConfig: scheduling.schedulerConfig,
          }
        : { scheduleEffect: { kind: 'none' } as const }),
    };
    validateQuestionAttempt(answered);
    await db.questionAttempts.put(answered);
    if (scheduling) await db.questions.put(scheduledQuestion);
    return { attempt: answered, question: scheduledQuestion, recorded: true };
  });
}

export interface RecordQuestionCorrectionInput {
  attemptId: string;
  submittedAnswer: string | string[];
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
  now?: number;
}

export async function recordQuestionCorrection(
  input: RecordQuestionCorrectionInput,
): Promise<QuestionAttempt> {
  const now = input.now ?? Date.now();
  return db.transaction('rw', db.questionAttempts, async () => {
    const attempt = await db.questionAttempts.get(input.attemptId);
    if (!attempt || attempt.status !== 'answered') {
      throw new Error('Only an answered Question attempt can record a correction.');
    }
    if (attempt.undoneAt !== undefined) {
      throw new Error('An undone Question attempt cannot record a correction.');
    }
    if (
      !Number.isSafeInteger(input.marksEarned) ||
      !Number.isSafeInteger(input.marksAvailable) ||
      input.marksAvailable <= 0 ||
      input.marksEarned < 0 ||
      input.marksEarned > input.marksAvailable
    ) {
      throw new Error('Question correction marks are invalid.');
    }
    if (attempt.correction) {
      if (
        answersEqual(attempt.correction.submittedAnswer, input.submittedAnswer) &&
        attempt.correction.marksEarned === input.marksEarned &&
        attempt.correction.marksAvailable === input.marksAvailable
      ) {
        return attempt;
      }
      throw new Error('A Question correction is immutable.');
    }
    const correction: QuestionCorrection = {
      submittedAt: now,
      submittedAnswer: input.submittedAnswer,
      marksEarned: input.marksEarned,
      marksAvailable: input.marksAvailable,
      lineVerdicts: input.lineVerdicts,
    };
    const updated: QuestionAttempt = {
      ...attempt,
      correction,
      updatedAt: now,
    };
    await db.questionAttempts.put(updated);
    return updated;
  });
}

export async function abandonQuestionAttempt(
  attemptId: string,
  now = Date.now(),
): Promise<QuestionAttempt> {
  return db.transaction('rw', db.questionAttempts, async () => {
    const attempt = await db.questionAttempts.get(attemptId);
    if (!attempt) throw new Error('Question attempt not found.');
    if (attempt.status === 'answered') throw new Error('An answered attempt cannot be abandoned.');
    if (attempt.status === 'abandoned') return attempt;
    const abandoned: QuestionAttempt = {
      ...attempt,
      status: 'abandoned',
      abandonedAt: now,
      updatedAt: now,
      scheduleEffect: { kind: 'none' },
    };
    await db.questionAttempts.put(abandoned);
    return abandoned;
  });
}

export async function undoQuestionAttempt(
  attemptId: string,
  now = Date.now(),
): Promise<{ attempt: QuestionAttempt; question: QuestionDefinition }> {
  return db.transaction('rw', [db.courses, db.questions, db.questionAttempts], async () => {
    const attempt = await db.questionAttempts.get(attemptId);
    if (!attempt || attempt.status !== 'answered') {
      throw new Error('Only an answered Question attempt can be undone.');
    }
    const question = await db.questions.get(attempt.questionId);
    if (!question) throw new Error('Question not found.');
    const course = await db.courses.get(question.courseId);
    if (!course) throw new Error('Question Course not found.');
    const undone: QuestionAttempt = {
      ...attempt,
      undoneAt: Math.max(attempt.undoneAt ?? Number.NEGATIVE_INFINITY, now),
      updatedAt: Math.max(attempt.updatedAt, now),
    };
    await db.questionAttempts.put(undone);
    const attempts = await db.questionAttempts.where('questionId').equals(question.id).toArray();
    const schedule = replayQuestionSchedule(question, attempts, course.fsrsParameters);
    const updatedQuestion: QuestionDefinition = {
      ...question,
      ...schedule,
      scheduleUpdatedAt: now,
      updatedAt: now,
    };
    await db.questions.put(updatedQuestion);
    return { attempt: undone, question: updatedQuestion };
  });
}

export type QuestionSchedulerGrade = Grade;
