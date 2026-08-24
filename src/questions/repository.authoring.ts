import { clearTombstone, recordTombstone } from '../db/mutationStamp';
import { db, makeId } from '../db/schema';
import { questionGeneratorRegistry } from './generators';
import {
  cleanName,
  jsonEqual,
  requireQuestionPayload,
  sortedUnique,
  validateLessonMembership,
  validatedConceptSet,
} from './repository.shared';
import { emptyQuestionSchedule } from './scheduler';
import type {
  FixedQuestionDefinition,
  GeneratedQuestionDefinition,
  QuestionConceptSet,
  QuestionDefinition,
  QuestionPayload,
} from './types';

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
