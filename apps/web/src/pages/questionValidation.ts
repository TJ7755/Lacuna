import { numericAnswerSpecIsValid } from '../components/items/NumericAnswerEditor';
import type { ItemFixture, NumericAnswerSpec } from '@lacuna/core/db/types';
import type { compileMarkScheme } from '../items/markSchemeCompiler';
import type { GeneratorDescription } from '../questions/generators/contracts';
import { INTEGER_ROOT_QUADRATIC_GENERATOR_KEY } from '../questions/generators/integerRootQuadratic';
import type { QuestionPayload } from '@lacuna/core/questions/types';
import type { QuestionAnswerKind } from './questionDraft';

export function fixedPayload(
  answerKind: QuestionAnswerKind,
  numericAnswer: NumericAnswerSpec,
  workingCompilation: ReturnType<typeof compileMarkScheme>,
  fixtures: ItemFixture[],
): QuestionPayload | null {
  if (answerKind === 'numeric') {
    if (!numericAnswerSpecIsValid(numericAnswer)) return null;
    return { v: 1, kind: 'numeric', answer: numericAnswer };
  }
  if (
    workingCompilation.lines.length === 0 ||
    workingCompilation.lines.some((line) => line.kind === 'error')
  )
    return null;
  return {
    v: 1,
    kind: 'working',
    scheme: workingCompilation.lines.map((line) => {
      if (line.kind === 'error') throw new Error('Invalid mark scheme.');
      return line.value;
    }),
    fixtures,
  };
}

export function generatedConfigurationErrors(
  generator: GeneratorDescription,
  configuration: Record<string, string | number | boolean>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of generator.configurationFields) {
    if (field.kind !== 'integer') continue;
    const value = configuration[field.key];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      (field.minimum !== undefined && value < field.minimum) ||
      (field.maximum !== undefined && value > field.maximum)
    ) {
      errors[field.key] =
        field.minimum !== undefined && field.maximum !== undefined
          ? `Enter a whole number from ${field.minimum} to ${field.maximum}.`
          : 'Enter a valid whole number.';
    }
  }
  if (
    generator.key === INTEGER_ROOT_QUADRATIC_GENERATOR_KEY &&
    !errors.minimumRootMagnitude &&
    !errors.maximumRootMagnitude &&
    Number(configuration.minimumRootMagnitude) > Number(configuration.maximumRootMagnitude)
  ) {
    errors.minimumRootMagnitude = 'Use a minimum root magnitude no greater than the maximum.';
  }
  return errors;
}
