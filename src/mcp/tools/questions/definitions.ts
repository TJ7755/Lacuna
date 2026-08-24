import { z } from 'zod';
import type { NumericAnswerSpec } from '../../../db/types';
import { runWorkingFixtures } from '../../../items/fixtureRunner';
import { compileMarkScheme } from '../../../items/markSchemeCompiler';
import { numericAnswerSpecIsValid } from '../../../items/numericAnswerSpec';
import {
  createFixedQuestion as repoCreateFixedQuestion,
  createGeneratedQuestion as repoCreateGeneratedQuestion,
  deleteQuestion as repoDeleteQuestion,
  type getQuestion as repoGetQuestion,
  listQuestions as repoListQuestions,
  snapshotQuestion as repoSnapshotQuestion,
  updateFixedQuestion as repoUpdateFixedQuestion,
  updateGeneratedQuestion as repoUpdateGeneratedQuestion,
} from '../../../questions/repository';
import type { QuestionPayload } from '../../../questions/types';
import type { ToolDefinition } from '../../types';
import { auditGenerator, requiredGeneratorConfigSchema } from './generators';
import {
  authoredTextSchema,
  conceptIdSchema,
  courseIdSchema,
  notFound,
  ok,
  questionIdSchema,
  requireCourse,
  requireLesson,
  requireQuestion,
  requireRelationships,
  validation,
} from './shared';

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
export const listQuestions: ToolDefinition<
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
      await requireLesson(courseId, lessonId);
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
export const getQuestion: ToolDefinition<
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
export const createFixedQuestion: ToolDefinition<
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
export const updateFixedQuestion: ToolDefinition<
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

const createGeneratedQuestionSchema = z
  .object({
    ...relationshipShape,
    generatorKey: z.string().trim().min(1),
    generatorVersion: z.number().int().positive(),
    generatorConfig: requiredGeneratorConfigSchema,
  })
  .strict();
export const createGeneratedQuestion: ToolDefinition<
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
export const updateGeneratedQuestion: ToolDefinition<
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
export const deleteQuestion: ToolDefinition<
  z.infer<typeof deleteQuestionSchema>,
  { id: string }
> = {
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
