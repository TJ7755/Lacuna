// Concept, Question and built-in generator tools. Question attempts are
// deliberately absent: an agent must not manufacture answer evidence or mutate
// either the Question or Card memory model on the learner's behalf.

import { z } from 'zod';
import type { NumericAnswerSpec } from '../../db/types';
import { runWorkingFixtures } from '../../items/fixtureRunner';
import { compileMarkScheme } from '../../items/markSchemeCompiler';
import { numericAnswerSpecIsValid } from '../../items/numericAnswerSpec';
import { questionGeneratorRegistry, QuestionGeneratorError } from '../../questions/generators';
import {
  createConcept as repoCreateConcept,
  createFixedQuestion as repoCreateFixedQuestion,
  createGeneratedQuestion as repoCreateGeneratedQuestion,
  deleteConcept as repoDeleteConcept,
  deleteQuestion as repoDeleteQuestion,
  getQuestion as repoGetQuestion,
  listConcepts as repoListConcepts,
  listQuestions as repoListQuestions,
  snapshotConcept as repoSnapshotConcept,
  snapshotQuestion as repoSnapshotQuestion,
  updateConcept as repoUpdateConcept,
  updateFixedQuestion as repoUpdateFixedQuestion,
  updateGeneratedQuestion as repoUpdateGeneratedQuestion,
} from '../../questions/repository';
import type { QuestionPayload } from '../../questions/types';
import * as read from '../../db/read';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

const courseIdSchema = z.string().trim().min(1).describe('The id of the Course.');
const conceptIdSchema = z.string().trim().min(1).describe('The id of a Concept.');
const questionIdSchema = z.string().trim().min(1).describe('The id of a Question definition.');
const authoredTextSchema = z.string().trim().min(1);

function ok<T>(data: T): ToolResult<T> {
  return { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

function validation(message: string): never {
  throw new McpToolException({ kind: 'validation', message });
}

async function requireCourse(courseId: string): Promise<void> {
  if (!(await read.getCourse(courseId))) notFound('Course', courseId);
}

async function requireQuestion(questionId: string) {
  const record = await repoGetQuestion(questionId);
  if (!record) notFound('Question', questionId);
  return record;
}

async function requireConcept(courseId: string, conceptId: string) {
  const concept = (await repoListConcepts(courseId)).find(
    (candidate) => candidate.id === conceptId,
  );
  if (!concept) notFound('Concept', conceptId);
  return concept;
}

async function requireRelationships(
  courseId: string,
  primaryLessonId: string | null | undefined,
  additionalLessonIds: readonly string[] | undefined,
  targetConceptId: string,
  prerequisiteConceptIds: readonly string[] | undefined,
): Promise<void> {
  await requireCourse(courseId);
  if (primaryLessonId && additionalLessonIds?.includes(primaryLessonId)) {
    validation('The primary Lesson cannot also be an additional Lesson.');
  }
  if (new Set(additionalLessonIds ?? []).size !== (additionalLessonIds ?? []).length) {
    validation('Additional Lesson ids must be unique.');
  }
  if (prerequisiteConceptIds?.includes(targetConceptId)) {
    validation('The primary target Concept cannot also be a prerequisite.');
  }
  if (new Set(prerequisiteConceptIds ?? []).size !== (prerequisiteConceptIds ?? []).length) {
    validation('Prerequisite Concept ids must be unique.');
  }
  const lessonIds = [...(primaryLessonId ? [primaryLessonId] : []), ...(additionalLessonIds ?? [])];
  for (const lessonId of lessonIds) {
    const lesson = await read.getLesson(lessonId);
    if (!lesson || lesson.courseId !== courseId) notFound('Lesson', lessonId);
  }
  await requireConcept(courseId, targetConceptId);
  for (const conceptId of prerequisiteConceptIds ?? []) {
    await requireConcept(courseId, conceptId);
  }
}

const numericAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), value: z.string() }).strict(),
  z.object({ kind: z.literal('within'), value: z.string(), tolerance: z.number() }).strict(),
  z.object({ kind: z.literal('matches-one-of'), values: z.array(z.string()).min(1) }).strict(),
]);
const itemFixtureSchema = z
  .object({
    id: z.string().optional(),
    studentAnswer: z.union([z.string(), z.array(z.string()).min(1)]),
    expectedMarks: z.number().int().nonnegative(),
    note: z.string().optional(),
  })
  .strict();
const questionPayloadInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('numeric'), answer: numericAnswerSchema }).strict(),
  z
    .object({
      kind: z.literal('working'),
      scheme: z.string(),
      fixtures: z.array(itemFixtureSchema).optional(),
    })
    .strict(),
]);

function compileQuestionPayload(
  input: z.infer<typeof questionPayloadInputSchema>,
): QuestionPayload {
  if (input.kind === 'numeric') {
    if (!numericAnswerSpecIsValid(input.answer)) {
      validation('The numeric answer specification is invalid.');
    }
    return { v: 1, kind: 'numeric', answer: input.answer as NumericAnswerSpec };
  }

  const compilation = compileMarkScheme(input.scheme);
  const errors = compilation.lines.filter((line) => line.kind === 'error');
  if (errors.length > 0 || compilation.lines.length === 0) {
    validation(
      errors.length > 0
        ? errors.map((error) => `Scheme line ${error.lineNumber}: ${error.message}`).join('\n')
        : 'Add a mark scheme.',
    );
  }
  const scheme = compilation.lines.flatMap((line) =>
    line.kind === 'compiled' ? [line.value] : [],
  );
  const fixtures = (input.fixtures ?? []).map((fixture, index) => ({
    ...fixture,
    id: fixture.id ?? `mcp-question-fixture-${index + 1}`,
  }));
  const failingFixture = runWorkingFixtures(scheme, fixtures).find((run) => !run.passes);
  if (failingFixture) {
    validation(
      `Fixture expected ${failingFixture.fixture.expectedMarks} marks but received ${failingFixture.marksEarned}.`,
    );
  }
  return {
    v: 1,
    kind: 'working',
    scheme,
    ...(fixtures.length > 0 ? { fixtures } : {}),
  };
}

function auditGenerator(request: {
  generatorKey: string;
  generatorVersion: number;
  generatorConfig: unknown;
}) {
  try {
    return questionGeneratorRegistry.audit({
      generatorKey: request.generatorKey,
      generatorVersion: request.generatorVersion,
      configuration: request.generatorConfig,
    });
  } catch (error) {
    if (error instanceof QuestionGeneratorError) validation(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

const listConceptsSchema = z.object({ courseId: courseIdSchema }).strict();
const listConcepts: ToolDefinition<
  z.infer<typeof listConceptsSchema>,
  Awaited<ReturnType<typeof repoListConcepts>>
> = {
  name: 'lacuna.list_concepts',
  description: "List a Course's Concepts, ordered by name.",
  inputSchema: listConceptsSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    await requireCourse(courseId);
    return ok(await repoListConcepts(courseId));
  },
};

const createConceptSchema = z
  .object({
    courseId: courseIdSchema,
    name: authoredTextSchema.describe('The stable knowledge or skill name.'),
  })
  .strict();
const createConcept: ToolDefinition<
  z.infer<typeof createConceptSchema>,
  Awaited<ReturnType<typeof repoCreateConcept>>
> = {
  name: 'lacuna.create_concept',
  description: 'Create a Concept that Cards and Questions may reference.',
  inputSchema: createConceptSchema,
  requiredScope: 'write',
  async handler({ courseId, name }) {
    await requireCourse(courseId);
    return ok(await repoCreateConcept(courseId, name));
  },
};

const updateConceptSchema = z
  .object({
    conceptId: conceptIdSchema,
    name: authoredTextSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined, {
    message: 'Provide at least one Concept change.',
  });
const updateConcept: ToolDefinition<
  z.infer<typeof updateConceptSchema>,
  Awaited<ReturnType<typeof repoUpdateConcept>>
> = {
  name: 'lacuna.update_concept',
  description: "Update a Concept's display name. Migration provenance remains human-reviewed.",
  inputSchema: updateConceptSchema,
  requiredScope: 'write',
  async handler({ conceptId, ...changes }) {
    try {
      return ok(await repoUpdateConcept(conceptId, changes));
    } catch (error) {
      if (error instanceof Error && error.message === 'Concept not found.') {
        notFound('Concept', conceptId);
      }
      throw error;
    }
  },
};

const deleteConceptSchema = z.object({ conceptId: conceptIdSchema }).strict();
const deleteConcept: ToolDefinition<z.infer<typeof deleteConceptSchema>, { id: string }> = {
  name: 'lacuna.delete_concept',
  description: 'Delete an unreferenced Concept. Refuses Concepts still used by a Card or Question.',
  inputSchema: deleteConceptSchema,
  requiredScope: 'destructive',
  async handler({ conceptId }) {
    const snapshot = await repoSnapshotConcept(conceptId);
    if (!snapshot) notFound('Concept', conceptId);
    try {
      await repoDeleteConcept(conceptId);
    } catch (error) {
      throw new McpToolException({
        kind: 'conflict',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      data: { id: conceptId },
      undo: { kind: 'restoreConcept', snapshot },
    };
  },
};

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const relationshipShape = {
  courseId: courseIdSchema,
  primaryLessonId: z.string().trim().min(1).nullable().optional(),
  additionalLessonIds: z.array(z.string().trim().min(1)).optional(),
  name: authoredTextSchema,
  tags: z.array(z.string().trim().min(1)).optional(),
  suspended: z.boolean().optional(),
  targetConceptId: conceptIdSchema,
  prerequisiteConceptIds: z.array(conceptIdSchema).optional(),
};

const listQuestionsSchema = z
  .object({
    courseId: courseIdSchema,
    lessonId: z.string().trim().min(1).optional(),
    kind: z.enum(['fixed', 'generated']).optional(),
  })
  .strict();
const listQuestions: ToolDefinition<
  z.infer<typeof listQuestionsSchema>,
  Awaited<ReturnType<typeof repoListQuestions>>
> = {
  name: 'lacuna.list_questions',
  description: 'List fixed Questions and generated families separately from Cards.',
  inputSchema: listQuestionsSchema,
  requiredScope: 'read',
  async handler({ courseId, lessonId, kind }) {
    await requireCourse(courseId);
    if (lessonId !== undefined) {
      const lesson = await read.getLesson(lessonId);
      if (!lesson || lesson.courseId !== courseId) notFound('Lesson', lessonId);
    }
    const questions = await repoListQuestions(courseId);
    return ok(
      questions.filter(
        (question) =>
          (kind === undefined || question.kind === kind) &&
          (lessonId === undefined ||
            question.primaryLessonId === lessonId ||
            question.additionalLessonIds.includes(lessonId)),
      ),
    );
  },
};

const getQuestionSchema = z.object({ questionId: questionIdSchema }).strict();
const getQuestion: ToolDefinition<
  z.infer<typeof getQuestionSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  name: 'lacuna.get_question',
  description: 'Fetch one Question definition and its target/prerequisite Concept set.',
  inputSchema: getQuestionSchema,
  requiredScope: 'read',
  async handler({ questionId }) {
    return ok(await requireQuestion(questionId));
  },
};

const createFixedQuestionSchema = z
  .object({
    ...relationshipShape,
    prompt: authoredTextSchema,
    payload: questionPayloadInputSchema,
    explanation: authoredTextSchema.describe('Worked feedback shown after submission.'),
  })
  .strict();
const createFixedQuestion: ToolDefinition<
  z.infer<typeof createFixedQuestionSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  name: 'lacuna.create_fixed_question',
  description:
    'Create a fixed application Question with one primary target, optional prerequisites and mandatory worked feedback.',
  inputSchema: createFixedQuestionSchema,
  requiredScope: 'write',
  async handler(input) {
    await requireRelationships(
      input.courseId,
      input.primaryLessonId,
      input.additionalLessonIds,
      input.targetConceptId,
      input.prerequisiteConceptIds,
    );
    const question = await repoCreateFixedQuestion({
      ...input,
      payload: compileQuestionPayload(input.payload),
    });
    return ok(await requireQuestion(question.id));
  },
};

const updateFixedQuestionSchema = z
  .object({
    questionId: questionIdSchema,
    primaryLessonId: z.string().trim().min(1).nullable().optional(),
    additionalLessonIds: z.array(z.string().trim().min(1)).optional(),
    name: authoredTextSchema.optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    targetConceptId: conceptIdSchema.optional(),
    prerequisiteConceptIds: z.array(conceptIdSchema).optional(),
    prompt: authoredTextSchema.optional(),
    payload: questionPayloadInputSchema.optional(),
    explanation: authoredTextSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      Object.entries(input).some(([key, value]) => key !== 'questionId' && value !== undefined),
    { message: 'Provide at least one fixed Question change.' },
  );
const updateFixedQuestion: ToolDefinition<
  z.infer<typeof updateFixedQuestionSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  name: 'lacuna.update_fixed_question',
  description:
    'Update fixed Question authoring. Semantic changes start a new Question scheduling epoch.',
  inputSchema: updateFixedQuestionSchema,
  requiredScope: 'write',
  async handler({ questionId, payload, ...changes }) {
    const existing = await requireQuestion(questionId);
    if (existing.question.kind !== 'fixed') validation('The Question is not fixed.');
    const targetConceptId = changes.targetConceptId ?? existing.concepts.targetConceptIds[0];
    if (!targetConceptId) validation('A Question requires one primary target Concept.');
    await requireRelationships(
      existing.question.courseId,
      changes.primaryLessonId === undefined
        ? existing.question.primaryLessonId
        : changes.primaryLessonId,
      changes.additionalLessonIds ?? existing.question.additionalLessonIds,
      targetConceptId,
      changes.prerequisiteConceptIds ?? existing.concepts.prerequisiteConceptIds,
    );
    await repoUpdateFixedQuestion(questionId, {
      ...changes,
      ...(payload === undefined ? {} : { payload: compileQuestionPayload(payload) }),
    });
    return ok(await requireQuestion(questionId));
  },
};

const requiredUnknown = z.unknown().refine((value) => value !== undefined, {
  message: 'generatorConfig is required.',
});
const createGeneratedQuestionSchema = z
  .object({
    ...relationshipShape,
    generatorKey: z.string().trim().min(1),
    generatorVersion: z.number().int().positive(),
    generatorConfig: requiredUnknown,
  })
  .strict();
const createGeneratedQuestion: ToolDefinition<
  z.infer<typeof createGeneratedQuestionSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  name: 'lacuna.create_generated_question',
  description:
    'Create one scheduled generated Question family from an audited built-in generator configuration.',
  inputSchema: createGeneratedQuestionSchema,
  requiredScope: 'write',
  async handler(input) {
    await requireRelationships(
      input.courseId,
      input.primaryLessonId,
      input.additionalLessonIds,
      input.targetConceptId,
      input.prerequisiteConceptIds,
    );
    auditGenerator(input);
    const question = await repoCreateGeneratedQuestion(input);
    return ok(await requireQuestion(question.id));
  },
};

const updateGeneratedQuestionSchema = z
  .object({
    questionId: questionIdSchema,
    primaryLessonId: z.string().trim().min(1).nullable().optional(),
    additionalLessonIds: z.array(z.string().trim().min(1)).optional(),
    name: authoredTextSchema.optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    targetConceptId: conceptIdSchema.optional(),
    prerequisiteConceptIds: z.array(conceptIdSchema).optional(),
    generatorKey: z.string().trim().min(1).optional(),
    generatorVersion: z.number().int().positive().optional(),
    generatorConfig: z.unknown().optional(),
  })
  .strict()
  .refine(
    (input) =>
      Object.entries(input).some(([key, value]) => key !== 'questionId' && value !== undefined),
    { message: 'Provide at least one generated Question change.' },
  );
const updateGeneratedQuestion: ToolDefinition<
  z.infer<typeof updateGeneratedQuestionSchema>,
  NonNullable<Awaited<ReturnType<typeof repoGetQuestion>>>
> = {
  name: 'lacuna.update_generated_question',
  description:
    'Update a generated family. Generator, configuration or Concept changes start a new scheduling epoch.',
  inputSchema: updateGeneratedQuestionSchema,
  requiredScope: 'write',
  async handler({ questionId, ...changes }) {
    const existing = await requireQuestion(questionId);
    if (existing.question.kind !== 'generated') validation('The Question is not generated.');
    const targetConceptId = changes.targetConceptId ?? existing.concepts.targetConceptIds[0];
    if (!targetConceptId) validation('A Question requires one primary target Concept.');
    await requireRelationships(
      existing.question.courseId,
      changes.primaryLessonId === undefined
        ? existing.question.primaryLessonId
        : changes.primaryLessonId,
      changes.additionalLessonIds ?? existing.question.additionalLessonIds,
      targetConceptId,
      changes.prerequisiteConceptIds ?? existing.concepts.prerequisiteConceptIds,
    );
    if (
      changes.generatorKey !== undefined ||
      changes.generatorVersion !== undefined ||
      changes.generatorConfig !== undefined
    ) {
      auditGenerator({
        generatorKey: changes.generatorKey ?? existing.question.generatorKey,
        generatorVersion: changes.generatorVersion ?? existing.question.generatorVersion,
        generatorConfig: changes.generatorConfig ?? existing.question.generatorConfig,
      });
    }
    await repoUpdateGeneratedQuestion(questionId, changes);
    return ok(await requireQuestion(questionId));
  },
};

const deleteQuestionSchema = z.object({ questionId: questionIdSchema }).strict();
const deleteQuestion: ToolDefinition<z.infer<typeof deleteQuestionSchema>, { id: string }> = {
  name: 'lacuna.delete_question',
  description:
    'Delete a Question definition and its Concept links while retaining immutable attempt evidence.',
  inputSchema: deleteQuestionSchema,
  requiredScope: 'destructive',
  async handler({ questionId }) {
    const snapshot = await repoSnapshotQuestion(questionId);
    if (!snapshot) notFound('Question', questionId);
    await repoDeleteQuestion(questionId);
    return {
      data: { id: questionId },
      undo: { kind: 'restoreQuestion', snapshot },
    };
  },
};

// ---------------------------------------------------------------------------
// Built-in generators
// ---------------------------------------------------------------------------

const listQuestionGenerators: ToolDefinition<
  Record<string, never>,
  ReturnType<typeof questionGeneratorRegistry.list>
> = {
  name: 'lacuna.list_question_generators',
  description: 'List versioned built-in Question generators and their typed configuration fields.',
  inputSchema: z.object({}).strict(),
  requiredScope: 'read',
  async handler() {
    return ok(questionGeneratorRegistry.list());
  },
};

const auditQuestionGeneratorSchema = z
  .object({
    generatorKey: z.string().trim().min(1),
    generatorVersion: z.number().int().positive(),
    generatorConfig: requiredUnknown,
  })
  .strict();
const auditQuestionGenerator: ToolDefinition<
  z.infer<typeof auditQuestionGeneratorSchema>,
  ReturnType<typeof questionGeneratorRegistry.audit>
> = {
  name: 'lacuna.audit_question_generator',
  description:
    'Validate a built-in generator configuration and return its deterministic audited corpus before authoring.',
  inputSchema: auditQuestionGeneratorSchema,
  requiredScope: 'read',
  async handler(input) {
    return ok(auditGenerator(input));
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous checked definitions.
export const QUESTION_TOOLS: readonly ToolDefinition<any, any>[] = [
  listConcepts,
  createConcept,
  updateConcept,
  deleteConcept,
  listQuestions,
  getQuestion,
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
  updateGeneratedQuestion,
  deleteQuestion,
  listQuestionGenerators,
  auditQuestionGenerator,
];

export {
  listConcepts,
  createConcept,
  updateConcept,
  deleteConcept,
  listQuestions,
  getQuestion,
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
  updateGeneratedQuestion,
  deleteQuestion,
  listQuestionGenerators,
  auditQuestionGenerator,
};
