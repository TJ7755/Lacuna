import type { z } from 'zod';
import { QuestionGeneratorError, questionGeneratorRegistry } from '../../../questions/generators';
import {
  auditQuestionGeneratorContract,
  listQuestionGeneratorsContract,
} from '../../contracts/questions';
import type { ToolDefinition } from '../../types';
import { ok, validation } from './shared';

export { requiredGeneratorConfigSchema } from '../../contracts/questions';

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
  ...listQuestionGeneratorsContract,
  async handler() {
    return ok(questionGeneratorRegistry.list());
  },
};

export const auditQuestionGenerator: ToolDefinition<
  z.infer<typeof auditQuestionGeneratorContract.inputSchema>,
  ReturnType<typeof questionGeneratorRegistry.audit>
> = {
  ...auditQuestionGeneratorContract,
  async handler(input) {
    return ok(auditGenerator(input));
  },
};
