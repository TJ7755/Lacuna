import { z } from 'zod';
import { QuestionGeneratorError, questionGeneratorRegistry } from '../../../questions/generators';
import type { ToolDefinition } from '../../types';
import { ok, validation } from './shared';

export const requiredGeneratorConfigSchema = z.unknown().refine((value) => value !== undefined, {
  message: 'generatorConfig is required.',
});

export function auditGenerator(request: {
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

export const listQuestionGenerators: ToolDefinition<
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
    generatorConfig: requiredGeneratorConfigSchema,
  })
  .strict();
export const auditQuestionGenerator: ToolDefinition<
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
