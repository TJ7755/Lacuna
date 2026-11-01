import type { QuestionGeneratorErrorCode } from './contracts';

/** A stable failure that callers can handle without parsing prose or evaluating imported code. */
export class QuestionGeneratorError extends Error {
  readonly code: QuestionGeneratorErrorCode;
  readonly generatorKey: string;
  readonly generatorVersion: number;

  constructor(
    code: QuestionGeneratorErrorCode,
    generatorKey: string,
    generatorVersion: number,
    message: string,
  ) {
    super(message);
    this.name = 'QuestionGeneratorError';
    this.code = code;
    this.generatorKey = generatorKey;
    this.generatorVersion = generatorVersion;
  }
}
