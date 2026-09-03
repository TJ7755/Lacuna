import { z } from 'zod';
import type { ToolContract } from '../types';

export const courseIdSchema = z.string().trim().min(1).describe('The id of the Course.');
export const conceptIdSchema = z.string().trim().min(1).describe('The id of a Concept.');
export const questionIdSchema = z.string().trim().min(1).describe('The id of a Question definition.');
export const authoredTextSchema = z.string().trim().min(1);
export const requiredGeneratorConfigSchema = z.unknown().refine((value) => value !== undefined, {
  message: 'generatorConfig is required.',
});

const numericAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), value: z.string() }).strict(),
  z.object({ kind: z.literal('within'), value: z.string(), tolerance: z.number() }).strict(),
  z.object({ kind: z.literal('matches-one-of'), values: z.array(z.string()).min(1) }).strict(),
]);
const itemFixtureSchema = z.object({
  id: z.string().optional(),
  studentAnswer: z.union([z.string(), z.array(z.string()).min(1)]),
  expectedMarks: z.number().int().nonnegative(),
  note: z.string().optional(),
}).strict();
export const questionPayloadInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('numeric'), answer: numericAnswerSchema }).strict(),
  z.object({
    kind: z.literal('working'),
    scheme: z.string(),
    fixtures: z.array(itemFixtureSchema).optional(),
  }).strict(),
]);

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

export const listConceptsContract = {
  name: 'lacuna.list_concepts',
  description: "List a Course's Concepts, ordered by name.",
  inputSchema: z.object({ courseId: courseIdSchema }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;
export const createConceptContract = {
  name: 'lacuna.create_concept',
  description: 'Create a Concept that Cards and Questions may reference.',
  inputSchema: z.object({
    courseId: courseIdSchema,
    name: authoredTextSchema.describe('The stable Concept name.'),
  }).strict(),
  requiredScope: 'write',
} satisfies ToolContract;
export const updateConceptContract = {
  name: 'lacuna.update_concept',
  description: "Update a Concept's display name. Migration provenance remains human-reviewed.",
  inputSchema: z.object({
    conceptId: conceptIdSchema,
    name: authoredTextSchema.optional(),
  }).strict().refine((input) => input.name !== undefined, {
    message: 'Provide at least one Concept change.',
  }),
  requiredScope: 'write',
} satisfies ToolContract;
export const deleteConceptContract = {
  name: 'lacuna.delete_concept',
  description: 'Delete an unreferenced Concept. Refuses Concepts still used by a Card or Question.',
  inputSchema: z.object({ conceptId: conceptIdSchema }).strict(),
  requiredScope: 'destructive',
} satisfies ToolContract;

export const listQuestionsContract = {
  name: 'lacuna.list_questions',
  description: 'List fixed Questions and generated families separately from Cards.',
  inputSchema: z.object({
    courseId: courseIdSchema,
    lessonId: z.string().trim().min(1).optional(),
    kind: z.enum(['fixed', 'generated']).optional(),
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;
export const getQuestionContract = {
  name: 'lacuna.get_question',
  description: 'Fetch one Question definition and its target/prerequisite Concept set.',
  inputSchema: z.object({ questionId: questionIdSchema }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;
export const createFixedQuestionContract = {
  name: 'lacuna.create_fixed_question',
  description:
    'Create a fixed application Question with one primary target, optional prerequisites and mandatory worked feedback.',
  inputSchema: z.object({
    ...relationshipShape,
    prompt: authoredTextSchema,
    payload: questionPayloadInputSchema,
    explanation: authoredTextSchema.describe('Worked feedback shown after submission.'),
  }).strict(),
  requiredScope: 'write',
} satisfies ToolContract;
export const updateFixedQuestionContract = {
  name: 'lacuna.update_fixed_question',
  description: 'Update fixed Question authoring. Semantic changes start a new Question scheduling epoch.',
  inputSchema: z.object({
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
  }).strict().refine(
    (input) => Object.entries(input).some(([key, value]) => key !== 'questionId' && value !== undefined),
    { message: 'Provide at least one fixed Question change.' },
  ),
  requiredScope: 'write',
} satisfies ToolContract;
export const createGeneratedQuestionContract = {
  name: 'lacuna.create_generated_question',
  description:
    'Create one scheduled generated Question family from an audited built-in generator configuration.',
  inputSchema: z.object({
    ...relationshipShape,
    generatorKey: z.string().trim().min(1),
    generatorVersion: z.number().int().positive(),
    generatorConfig: requiredGeneratorConfigSchema,
  }).strict(),
  requiredScope: 'write',
} satisfies ToolContract;
export const updateGeneratedQuestionContract = {
  name: 'lacuna.update_generated_question',
  description:
    'Update a generated family. Generator, configuration or Concept changes start a new scheduling epoch.',
  inputSchema: z.object({
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
  }).strict().refine(
    (input) => Object.entries(input).some(([key, value]) => key !== 'questionId' && value !== undefined),
    { message: 'Provide at least one generated Question change.' },
  ),
  requiredScope: 'write',
} satisfies ToolContract;
export const deleteQuestionContract = {
  name: 'lacuna.delete_question',
  description: 'Delete a Question definition and its Concept links while retaining immutable attempt evidence.',
  inputSchema: z.object({ questionId: questionIdSchema }).strict(),
  requiredScope: 'destructive',
} satisfies ToolContract;

export const listQuestionGeneratorsContract = {
  name: 'lacuna.list_question_generators',
  description: 'List versioned built-in Question generators and their typed configuration fields.',
  inputSchema: z.object({}).strict(),
  requiredScope: 'read',
} satisfies ToolContract;
export const auditQuestionGeneratorContract = {
  name: 'lacuna.audit_question_generator',
  description:
    'Validate a built-in generator configuration and return its deterministic audited corpus before authoring.',
  inputSchema: z.object({
    generatorKey: z.string().trim().min(1),
    generatorVersion: z.number().int().positive(),
    generatorConfig: requiredGeneratorConfigSchema,
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;

export const QUESTION_TOOL_CONTRACTS = [
  listConceptsContract,
  createConceptContract,
  updateConceptContract,
  deleteConceptContract,
  listQuestionsContract,
  getQuestionContract,
  createFixedQuestionContract,
  updateFixedQuestionContract,
  createGeneratedQuestionContract,
  updateGeneratedQuestionContract,
  deleteQuestionContract,
  listQuestionGeneratorsContract,
  auditQuestionGeneratorContract,
] as const satisfies readonly ToolContract[];
