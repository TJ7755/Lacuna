import { db, makeId } from '../db/schema';
import type { CheckerDisputeReport, Grade, LineVerdict } from '../db/types';
import { clearTombstone, recordTombstone } from '../db/mutationStamp';
import { itemPayloadIsValid } from '../items/payloadValidation';
import { gradeQuestionAttempt } from './grading';
import { questionGeneratorRegistry } from './generators';
import { emptyQuestionSchedule, replayQuestionSchedule, scheduleQuestionReview } from './scheduler';
import {
  QUESTION_GRADE_MAPPING_VERSION,
  type Concept,
  type FixedQuestionDefinition,
  type GeneratedQuestionDefinition,
  type QuestionAttempt,
  type QuestionConceptSet,
  type QuestionCorrection,
  type QuestionDefinition,
  type QuestionPayload,
  type ResolvedQuestionInstance,
} from './types';
import { validateQuestionAttempt, validateQuestionConceptSet } from './domain';

function cleanName(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function isQuestionPayload(payload: unknown): payload is QuestionPayload {
  if (!itemPayloadIsValid(payload) || !payload || typeof payload !== 'object') return false;
  const candidate = payload as { v?: unknown; kind?: unknown };
  return candidate.v === 1 && (candidate.kind === 'numeric' || candidate.kind === 'working');
}

function requireQuestionPayload(payload: unknown): asserts payload is QuestionPayload {
  if (!isQuestionPayload(payload)) {
    throw new Error('A Question requires a valid numeric or working payload.');
  }
}

function sortedUnique(values: readonly string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return [...new Set(cleaned)].sort();
}

async function validateLessonMembership(
  courseId: string,
  primaryLessonId: string | null,
  additionalLessonIds: readonly string[],
): Promise<void> {
  const ids = sortedUnique([...(primaryLessonId ? [primaryLessonId] : []), ...additionalLessonIds]);
  if (ids.length === 0) return;
  const lessons = await db.lessons.bulkGet(ids);
  if (
    lessons.some((lesson) => !lesson || lesson.courseId !== courseId) ||
    (primaryLessonId && additionalLessonIds.includes(primaryLessonId))
  ) {
    throw new Error('Every linked Lesson must belong to the Question Course.');
  }
}

async function validatedConceptSet(args: {
  questionId: string;
  courseId: string;
  targetConceptId: string;
  prerequisiteConceptIds: readonly string[];
  authoringRevisionId: string;
  now: number;
  createdAt?: number;
}): Promise<QuestionConceptSet> {
  const prerequisiteConceptIds = sortedUnique(args.prerequisiteConceptIds);
  const ids = [args.targetConceptId, ...prerequisiteConceptIds];
  const concepts = (await db.concepts.bulkGet(ids)).filter(
    (concept): concept is Concept => concept !== undefined,
  );
  const set: QuestionConceptSet = {
    questionId: args.questionId,
    courseId: args.courseId,
    targetConceptIds: [args.targetConceptId],
    prerequisiteConceptIds,
    authoringRevisionId: args.authoringRevisionId,
    authoringUpdatedAt: args.now,
    createdAt: args.createdAt ?? args.now,
    updatedAt: args.now,
  };
  validateQuestionConceptSet(set, concepts);
  return set;
}

export async function createConcept(
  courseId: string,
  name: string,
  options: { id?: string; now?: number; provisional?: boolean } = {},
): Promise<Concept> {
  const now = options.now ?? Date.now();
  const concept: Concept = {
    id: options.id ?? makeId(),
    scope: 'course',
    scopeKey: `course:${courseId}`,
    courseId,
    name: cleanName(name, 'Untitled concept'),
    provisional: options.provisional ?? false,
    createdAt: now,
    updatedAt: now,
  };
  return db.transaction('rw', [db.courses, db.concepts, db.tombstones], async (tx) => {
    if (!(await db.courses.get(courseId))) throw new Error('Course not found.');
    await db.concepts.add(concept);
    await clearTombstone(tx, 'concepts', concept.id);
    return concept;
  });
}

export async function listConcepts(courseId: string): Promise<Concept[]> {
  return (await db.concepts.where('courseId').equals(courseId).toArray()).sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

export async function updateConcept(
  conceptId: string,
  changes: { name?: string; provisional?: boolean },
  now = Date.now(),
): Promise<Concept> {
  return db.transaction('rw', db.concepts, async () => {
    const concept = await db.concepts.get(conceptId);
    if (!concept) throw new Error('Concept not found.');
    if (concept.scope === 'legacy-scheduling-unit' && changes.provisional === false) {
      throw new Error('A legacy scheduling-unit Concept must remain provisional.');
    }
    const updated: Concept = {
      ...concept,
      ...(changes.name === undefined ? {} : { name: cleanName(changes.name, 'Untitled concept') }),
      ...(changes.provisional === undefined ? {} : { provisional: changes.provisional }),
      updatedAt: now,
    } as Concept;
    await db.concepts.put(updated);
    return updated;
  });
}

export async function deleteConcept(conceptId: string, now = Date.now()): Promise<void> {
  await db.transaction(
    'rw',
    [db.concepts, db.cards, db.questionConcepts, db.tombstones],
    async (tx) => {
      const concept = await db.concepts.get(conceptId);
      if (!concept) return;
      const [cardReference, questionReference] = await Promise.all([
        db.cards.where('conceptId').equals(conceptId).first(),
        db.questionConcepts
          .filter(
            (set) =>
              set.targetConceptIds.includes(conceptId) ||
              set.prerequisiteConceptIds.includes(conceptId),
          )
          .first(),
      ]);
      if (cardReference || questionReference) {
        throw new Error('The Concept is still referenced by a Card or Question.');
      }
      await db.concepts.delete(conceptId);
      await recordTombstone(tx, 'concepts', conceptId, now);
    },
  );
}

export type ConceptSnapshot = Concept;

export async function snapshotConcept(conceptId: string): Promise<ConceptSnapshot | null> {
  return (await db.concepts.get(conceptId)) ?? null;
}

/** Restore a Concept deleted by an undoable operation without weakening its scope. */
export async function restoreConcept(snapshot: ConceptSnapshot): Promise<void> {
  await db.transaction(
    'rw',
    [db.courses, db.schedulingUnits, db.concepts, db.tombstones],
    async (tx) => {
      if (!snapshot.id.trim() || !snapshot.name.trim()) {
        throw new Error('A Concept snapshot requires an id and name.');
      }
      if (snapshot.scope === 'course') {
        if (!(await db.courses.get(snapshot.courseId))) {
          throw new Error('A Concept snapshot references a missing Course.');
        }
        if (snapshot.scopeKey !== `course:${snapshot.courseId}`) {
          throw new Error('A Concept snapshot has an invalid Course scope.');
        }
      } else {
        if (!snapshot.provisional) {
          throw new Error('A legacy scheduling-unit Concept must remain provisional.');
        }
        if (!(await db.schedulingUnits.get(snapshot.legacySchedulingUnitId))) {
          throw new Error('A Concept snapshot references a missing scheduling unit.');
        }
        if (snapshot.scopeKey !== `legacy-scheduling-unit:${snapshot.legacySchedulingUnitId}`) {
          throw new Error('A Concept snapshot has an invalid legacy scope.');
        }
      }
      await db.concepts.put(snapshot);
      await clearTombstone(tx, 'concepts', snapshot.id);
    },
  );
}

interface QuestionRelationshipInput {
  courseId: string;
  primaryLessonId?: string | null;
  additionalLessonIds?: string[];
  name: string;
  tags?: string[];
  suspended?: boolean;
  targetConceptId: string;
  prerequisiteConceptIds?: string[];
  id?: string;
  now?: number;
}

export interface CreateFixedQuestionInput extends QuestionRelationshipInput {
  prompt: string;
  payload: QuestionPayload;
  explanation: string;
}

export async function createFixedQuestion(
  input: CreateFixedQuestionInput,
): Promise<FixedQuestionDefinition> {
  requireQuestionPayload(input.payload);
  if (!input.prompt.trim()) throw new Error('A fixed Question requires a prompt.');
  if (!input.explanation.trim()) throw new Error('A Question requires a worked explanation.');
  const now = input.now ?? Date.now();
  const id = input.id ?? makeId();
  const authoringRevisionId = makeId();
  const question: FixedQuestionDefinition = {
    id,
    courseId: input.courseId,
    primaryLessonId: input.primaryLessonId ?? null,
    additionalLessonIds: sortedUnique(input.additionalLessonIds ?? []),
    name: cleanName(input.name, 'Untitled question'),
    tags: sortedUnique(input.tags ?? []),
    suspended: input.suspended ?? false,
    kind: 'fixed',
    prompt: input.prompt,
    payload: input.payload,
    explanation: input.explanation,
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: makeId(),
    authoringRevisionId,
    authoringUpdatedAt: now,
    ...emptyQuestionSchedule(),
    scheduleEpoch: {
      id: makeId(),
      startedAt: now,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    scheduleUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  return db.transaction(
    'rw',
    [db.courses, db.lessons, db.concepts, db.questions, db.questionConcepts, db.tombstones],
    async (tx) => {
      if (!(await db.courses.get(input.courseId))) throw new Error('Course not found.');
      await validateLessonMembership(
        input.courseId,
        question.primaryLessonId,
        question.additionalLessonIds,
      );
      const set = await validatedConceptSet({
        questionId: id,
        courseId: input.courseId,
        targetConceptId: input.targetConceptId,
        prerequisiteConceptIds: input.prerequisiteConceptIds ?? [],
        authoringRevisionId,
        now,
      });
      await db.questions.add(question);
      await db.questionConcepts.add(set);
      await clearTombstone(tx, 'questions', id);
      await clearTombstone(tx, 'questionConcepts', id);
      return question;
    },
  );
}

export interface CreateGeneratedQuestionInput extends QuestionRelationshipInput {
  generatorKey: string;
  generatorVersion: number;
  generatorConfig: unknown;
}

export async function createGeneratedQuestion(
  input: CreateGeneratedQuestionInput,
): Promise<GeneratedQuestionDefinition> {
  const audit = questionGeneratorRegistry.audit({
    generatorKey: input.generatorKey,
    generatorVersion: input.generatorVersion,
    configuration: input.generatorConfig,
  });
  const now = input.now ?? Date.now();
  const id = input.id ?? makeId();
  const authoringRevisionId = makeId();
  const question: GeneratedQuestionDefinition = {
    id,
    courseId: input.courseId,
    primaryLessonId: input.primaryLessonId ?? null,
    additionalLessonIds: sortedUnique(input.additionalLessonIds ?? []),
    name: cleanName(input.name, audit.description.name),
    tags: sortedUnique(input.tags ?? []),
    suspended: input.suspended ?? false,
    kind: 'generated',
    generatorKey: input.generatorKey,
    generatorVersion: input.generatorVersion,
    generatorConfig: audit.configuration,
    contentVersion: 1,
    contentRevisionId: makeId(),
    authoringRevisionId,
    authoringUpdatedAt: now,
    ...emptyQuestionSchedule(),
    scheduleEpoch: {
      id: makeId(),
      startedAt: now,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    scheduleUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return db.transaction(
    'rw',
    [db.courses, db.lessons, db.concepts, db.questions, db.questionConcepts, db.tombstones],
    async (tx) => {
      if (!(await db.courses.get(input.courseId))) throw new Error('Course not found.');
      await validateLessonMembership(
        input.courseId,
        question.primaryLessonId,
        question.additionalLessonIds,
      );
      const set = await validatedConceptSet({
        questionId: id,
        courseId: input.courseId,
        targetConceptId: input.targetConceptId,
        prerequisiteConceptIds: input.prerequisiteConceptIds ?? [],
        authoringRevisionId,
        now,
      });
      await db.questions.add(question);
      await db.questionConcepts.add(set);
      await clearTombstone(tx, 'questions', id);
      await clearTombstone(tx, 'questionConcepts', id);
      return question;
    },
  );
}

export async function listQuestions(courseId: string): Promise<QuestionDefinition[]> {
  return (await db.questions.where('courseId').equals(courseId).toArray()).sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

export async function getQuestion(
  questionId: string,
): Promise<{ question: QuestionDefinition; concepts: QuestionConceptSet } | null> {
  const [question, concepts] = await Promise.all([
    db.questions.get(questionId),
    db.questionConcepts.get(questionId),
  ]);
  if (!question) return null;
  if (!concepts) throw new Error(`Question ${questionId} has no Concept relationship set.`);
  return { question, concepts };
}

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
  return instance;
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
  correction?: QuestionCorrection;
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
      correction: input.correction,
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

export interface UpdateFixedQuestionChanges {
  primaryLessonId?: string | null;
  additionalLessonIds?: string[];
  name?: string;
  tags?: string[];
  suspended?: boolean;
  prompt?: string;
  payload?: QuestionPayload;
  explanation?: string;
  targetConceptId?: string;
  prerequisiteConceptIds?: string[];
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function updateFixedQuestion(
  questionId: string,
  changes: UpdateFixedQuestionChanges,
  now = Date.now(),
): Promise<FixedQuestionDefinition> {
  return db.transaction(
    'rw',
    [db.lessons, db.concepts, db.questions, db.questionConcepts],
    async () => {
      const existing = await db.questions.get(questionId);
      if (!existing || existing.kind !== 'fixed') throw new Error('Fixed Question not found.');
      const existingSet = await db.questionConcepts.get(questionId);
      if (!existingSet) throw new Error('Question Concept relationship set not found.');
      const prompt = changes.prompt ?? existing.prompt;
      const payload = changes.payload ?? existing.payload;
      const explanation = changes.explanation ?? existing.explanation;
      requireQuestionPayload(payload);
      if (!prompt.trim()) throw new Error('A fixed Question requires a prompt.');
      if (!explanation.trim()) throw new Error('A Question requires a worked explanation.');

      const targetConceptId = changes.targetConceptId ?? existingSet.targetConceptIds[0];
      const prerequisiteConceptIds =
        changes.prerequisiteConceptIds ?? existingSet.prerequisiteConceptIds;
      const semantic =
        prompt !== existing.prompt ||
        !jsonEqual(payload, existing.payload) ||
        targetConceptId !== existingSet.targetConceptIds[0] ||
        !jsonEqual(sortedUnique(prerequisiteConceptIds), existingSet.prerequisiteConceptIds);
      const authoringRevisionId = makeId();
      const primaryLessonId =
        changes.primaryLessonId === undefined ? existing.primaryLessonId : changes.primaryLessonId;
      const additionalLessonIds =
        changes.additionalLessonIds === undefined
          ? existing.additionalLessonIds
          : sortedUnique(changes.additionalLessonIds);
      await validateLessonMembership(existing.courseId, primaryLessonId, additionalLessonIds);
      const set = await validatedConceptSet({
        questionId,
        courseId: existing.courseId,
        targetConceptId,
        prerequisiteConceptIds,
        authoringRevisionId,
        now,
        createdAt: existingSet.createdAt,
      });
      const next: FixedQuestionDefinition = {
        ...existing,
        primaryLessonId,
        additionalLessonIds,
        name:
          changes.name === undefined ? existing.name : cleanName(changes.name, 'Untitled question'),
        tags: changes.tags === undefined ? existing.tags : sortedUnique(changes.tags),
        suspended: changes.suspended ?? existing.suspended,
        prompt,
        payload,
        explanation,
        explanationStatus:
          changes.explanation === undefined ? existing.explanationStatus : 'authored',
        authoringRevisionId,
        authoringUpdatedAt: now,
        ...(semantic
          ? {
              ...emptyQuestionSchedule(),
              contentVersion: existing.contentVersion + 1,
              contentRevisionId: makeId(),
              scheduleEpoch: {
                id: makeId(),
                startedAt: now,
                reason: 'semantic-edit' as const,
                baseline: { kind: 'new' as const },
              },
              scheduleUpdatedAt: now,
            }
          : {}),
        updatedAt: now,
      };
      await db.questions.put(next);
      await db.questionConcepts.put(set);
      return next;
    },
  );
}

export interface UpdateGeneratedQuestionChanges {
  primaryLessonId?: string | null;
  additionalLessonIds?: string[];
  name?: string;
  tags?: string[];
  suspended?: boolean;
  generatorKey?: string;
  generatorVersion?: number;
  generatorConfig?: unknown;
  targetConceptId?: string;
  prerequisiteConceptIds?: string[];
}

export async function updateGeneratedQuestion(
  questionId: string,
  changes: UpdateGeneratedQuestionChanges,
  now = Date.now(),
): Promise<GeneratedQuestionDefinition> {
  return db.transaction(
    'rw',
    [db.lessons, db.concepts, db.questions, db.questionConcepts],
    async () => {
      const existing = await db.questions.get(questionId);
      if (!existing || existing.kind !== 'generated') {
        throw new Error('Generated Question not found.');
      }
      const existingSet = await db.questionConcepts.get(questionId);
      if (!existingSet) throw new Error('Question Concept relationship set not found.');
      const generatorKey = changes.generatorKey ?? existing.generatorKey;
      const generatorVersion = changes.generatorVersion ?? existing.generatorVersion;
      const requestedConfig =
        changes.generatorConfig === undefined ? existing.generatorConfig : changes.generatorConfig;
      const generatorChanged =
        generatorKey !== existing.generatorKey ||
        generatorVersion !== existing.generatorVersion ||
        !jsonEqual(requestedConfig, existing.generatorConfig);
      const generatorConfig = generatorChanged
        ? questionGeneratorRegistry.audit({
            generatorKey,
            generatorVersion,
            configuration: requestedConfig,
          }).configuration
        : existing.generatorConfig;
      const targetConceptId = changes.targetConceptId ?? existingSet.targetConceptIds[0];
      const prerequisiteConceptIds =
        changes.prerequisiteConceptIds ?? existingSet.prerequisiteConceptIds;
      const semantic =
        generatorChanged ||
        targetConceptId !== existingSet.targetConceptIds[0] ||
        !jsonEqual(sortedUnique(prerequisiteConceptIds), existingSet.prerequisiteConceptIds);
      const primaryLessonId =
        changes.primaryLessonId === undefined ? existing.primaryLessonId : changes.primaryLessonId;
      const additionalLessonIds =
        changes.additionalLessonIds === undefined
          ? existing.additionalLessonIds
          : sortedUnique(changes.additionalLessonIds);
      await validateLessonMembership(existing.courseId, primaryLessonId, additionalLessonIds);
      const authoringRevisionId = makeId();
      const set = await validatedConceptSet({
        questionId,
        courseId: existing.courseId,
        targetConceptId,
        prerequisiteConceptIds,
        authoringRevisionId,
        now,
        createdAt: existingSet.createdAt,
      });
      const next: GeneratedQuestionDefinition = {
        ...existing,
        primaryLessonId,
        additionalLessonIds,
        name:
          changes.name === undefined ? existing.name : cleanName(changes.name, 'Untitled question'),
        tags: changes.tags === undefined ? existing.tags : sortedUnique(changes.tags),
        suspended: changes.suspended ?? existing.suspended,
        generatorKey,
        generatorVersion,
        generatorConfig,
        authoringRevisionId,
        authoringUpdatedAt: now,
        ...(semantic
          ? {
              ...emptyQuestionSchedule(),
              contentVersion: existing.contentVersion + 1,
              contentRevisionId: makeId(),
              scheduleEpoch: {
                id: makeId(),
                startedAt: now,
                reason: 'semantic-edit' as const,
                baseline: { kind: 'new' as const },
              },
              scheduleUpdatedAt: now,
            }
          : {}),
        updatedAt: now,
      };
      await db.questions.put(next);
      await db.questionConcepts.put(set);
      return next;
    },
  );
}

export async function deleteQuestion(questionId: string, now = Date.now()): Promise<void> {
  await db.transaction(
    'rw',
    [db.questions, db.questionConcepts, db.questionAttempts, db.tombstones],
    async (tx) => {
      const question = await db.questions.get(questionId);
      if (!question) return;
      await db.questions.delete(questionId);
      await db.questionConcepts.delete(questionId);
      await recordTombstone(tx, 'questions', questionId, now);
      await recordTombstone(tx, 'questionConcepts', questionId, now);
      // Attempts are immutable evidence and deliberately survive Question deletion.
    },
  );
}

export interface QuestionSnapshot {
  question: QuestionDefinition;
  concepts: QuestionConceptSet;
}

export async function snapshotQuestion(questionId: string): Promise<QuestionSnapshot | null> {
  const [question, concepts] = await Promise.all([
    db.questions.get(questionId),
    db.questionConcepts.get(questionId),
  ]);
  if (!question) return null;
  if (!concepts) throw new Error(`Question ${questionId} has no Concept relationship set.`);
  return { question, concepts };
}

/** Restore authored Question state; immutable attempts deliberately remain in place. */
export async function restoreQuestion(snapshot: QuestionSnapshot): Promise<void> {
  const { question, concepts } = snapshot;
  await db.transaction(
    'rw',
    [db.courses, db.lessons, db.concepts, db.questions, db.questionConcepts, db.tombstones],
    async (tx) => {
      if (
        concepts.questionId !== question.id ||
        concepts.courseId !== question.courseId ||
        concepts.authoringRevisionId !== question.authoringRevisionId
      ) {
        throw new Error('A Question snapshot has an incoherent Concept relationship set.');
      }
      if (!(await db.courses.get(question.courseId))) {
        throw new Error('A Question snapshot references a missing Course.');
      }
      await validateLessonMembership(
        question.courseId,
        question.primaryLessonId,
        question.additionalLessonIds,
      );
      const conceptIds = [...concepts.targetConceptIds, ...concepts.prerequisiteConceptIds];
      const referencedConcepts = await db.concepts.bulkGet(conceptIds);
      if (
        referencedConcepts.some(
          (concept) =>
            !concept || concept.scope !== 'course' || concept.courseId !== question.courseId,
        )
      ) {
        throw new Error('A Question snapshot references a missing or foreign Concept.');
      }
      validateQuestionConceptSet(
        concepts,
        referencedConcepts.filter((concept): concept is Concept => concept !== undefined),
      );
      if (question.kind === 'fixed') {
        requireQuestionPayload(question.payload);
        if (!question.prompt.trim() || !question.explanation.trim()) {
          throw new Error('A fixed Question snapshot requires a prompt and worked explanation.');
        }
      } else if (
        !question.generatorKey.trim() ||
        !Number.isSafeInteger(question.generatorVersion)
      ) {
        throw new Error('A generated Question snapshot has an invalid generator identity.');
      }
      await db.questions.put(question);
      await db.questionConcepts.put(concepts);
      await clearTombstone(tx, 'questions', question.id);
      await clearTombstone(tx, 'questionConcepts', question.id);
    },
  );
}

export async function remediationCardsForQuestion(questionId: string) {
  const set = await db.questionConcepts.get(questionId);
  if (!set) return [];
  const orderedConceptIds = [...set.targetConceptIds, ...set.prerequisiteConceptIds];
  const cards =
    orderedConceptIds.length === 0
      ? []
      : await db.cards.where('conceptId').anyOf(orderedConceptIds).toArray();
  return orderedConceptIds.flatMap((conceptId) => {
    const candidates = cards
      .filter((card) => card.conceptId === conceptId && !card.suspended)
      .sort((left, right) => {
        if (left.due === null && right.due !== null) return -1;
        if (left.due !== null && right.due === null) return 1;
        return (left.due ?? 0) - (right.due ?? 0) || left.id.localeCompare(right.id);
      });
    return candidates.slice(0, 1);
  });
}

export type QuestionSchedulerGrade = Grade;
