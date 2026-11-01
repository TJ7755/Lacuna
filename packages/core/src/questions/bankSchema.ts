import { z } from 'zod';
import { techniqueTagsSchema } from '@lacuna/core/questions/techniqueTags';

const text = z.string().trim().min(1).max(20000);
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
const marks = z.number().int().positive().max(10000);
export const bankConceptSchema = z.strictObject({ id: identity, name: text });
export const bankSourceSchema = z.strictObject({
  title: text,
  reference: text,
  author: text,
  licence: text,
});
export const bankBlueprintSchema = z.strictObject({
  skill: text,
  type: text,
  difficulty: text,
  context: text,
});
const response = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('written') }),
  z.strictObject({ kind: z.literal('calculation') }),
  z.strictObject({
    kind: z.literal('multiple-choice'),
    selection: z.enum(['single', 'multiple']),
    options: z
      .array(z.strictObject({ id: identity, content: text }))
      .min(2)
      .max(100),
    correctOptionIds: z.array(identity).min(1),
  }),
]);
const answer = z.strictObject({
  maxMarks: marks,
  response,
  allocations: z
    .array(
      z.strictObject({
        id: identity,
        criterion: text,
        explanation: text.optional(),
        maxMarks: marks,
        dimension: z.enum(['knowledge', 'application', 'exam-execution', 'mixed']),
        targetConceptIds: z.array(identity).length(1),
        techniqueTags: techniqueTagsSchema.optional(),
      }),
    )
    .min(1)
    .max(100),
  prerequisiteConceptIds: z.array(identity).max(100),
});
const subpart = z.strictObject({ id: identity, prompt: text, answer: answer.optional() });
const part = z.strictObject({
  id: identity,
  prompt: text,
  answer: answer.optional(),
  subparts: z.array(subpart).max(100),
});
export const bankTemplateSchema = z.strictObject({
  title: text,
  questions: z
    .array(
      z.strictObject({
        id: identity,
        prompt: text,
        answer: answer.optional(),
        parts: z.array(part).max(100),
      }),
    )
    .min(1)
    .max(100),
});
export const declarativeFamilySchema = z.strictObject({
  id: identity,
  version: z.number().int().positive().max(1000000),
  parameters: z.record(
    z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
    z.array(z.number().int().min(-1000000).max(1000000)).min(1).max(100),
  ),
  derived: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
        op: z.enum(['+', '-', '*', '/', '^']),
        left: z.union([z.number().int().min(-1000000).max(1000000), z.string()]),
        right: z.union([z.number().int().min(-1000000).max(1000000), z.string()]),
      }),
    )
    .max(40),
  template: bankTemplateSchema,
  source: bankSourceSchema,
  blueprint: bankBlueprintSchema,
});
export const authoredBankSetSchema = bankTemplateSchema.extend({
  id: identity,
  source: bankSourceSchema,
  blueprint: bankBlueprintSchema,
});
export const questionBankSchema = z.strictObject({
  format: z.literal('lacuna-question-bank'),
  schemaVersion: z.literal(1),
  bankId: identity,
  bankVersion: z.number().int().positive().max(1000000),
  courseCode: identity,
  concepts: z.array(bankConceptSchema).min(1).max(10000),
  sets: z.array(authoredBankSetSchema).max(1000),
  families: z.array(declarativeFamilySchema).max(100),
});
export type QuestionBank = z.infer<typeof questionBankSchema>;
export type DeclarativeQuestionFamily = z.infer<typeof declarativeFamilySchema>;
export type AuthoredBankSet = z.infer<typeof authoredBankSetSchema>;
export const questionBankMetadataSchema = z.strictObject({
  bankId: identity,
  bankVersion: z.number().int().positive(),
  courseCode: identity,
  setId: identity,
  source: bankSourceSchema,
  blueprint: bankBlueprintSchema,
  concepts: z
    .array(
      bankConceptSchema.extend({
        sourceId: identity.optional(),
        sourceIndex: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(10000),
  fingerprint: text,
  family: declarativeFamilySchema.optional(),
  variant: z
    .strictObject({
      index: z.number().int().nonnegative().max(999),
      parameters: z.record(z.string(), z.number().finite()),
    })
    .optional(),
});
