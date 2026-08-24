import type { QuestionPayload } from '../../items/types';

export type QuestionGeneratorErrorCode =
  | 'unknown-generator'
  | 'unsupported-version'
  | 'invalid-configuration'
  | 'invalid-seed'
  | 'exhausted-constraint-space'
  | 'audit-failed';

export interface GeneratorConfigurationField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'integer' | 'boolean';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface GeneratorDescription {
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly summary: string;
  readonly configurationFields: readonly GeneratorConfigurationField[];
}

export interface GenerateQuestionRequest {
  readonly generatorKey: string;
  readonly generatorVersion: number;
  readonly configuration: unknown;
  readonly seed: string;
}

export interface AuditGeneratorRequest {
  readonly generatorKey: string;
  readonly generatorVersion: number;
  readonly configuration: unknown;
}

export interface ResolvedGeneratedQuestion {
  readonly generatorKey: string;
  readonly generatorVersion: number;
  readonly seed: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly generatorFingerprint: string;
  readonly renderedPrompt: string;
  readonly resolvedPayload: QuestionPayload;
  readonly renderedExplanation: string;
}

export interface GeneratorAuditInstance {
  readonly seed: string;
  readonly generatorFingerprint: string;
  readonly resolved: ResolvedGeneratedQuestion;
}

export interface GeneratorAuditResult {
  readonly description: GeneratorDescription;
  readonly configuration: unknown;
  readonly instances: readonly GeneratorAuditInstance[];
  readonly fingerprintCount: number;
}

export interface QuestionGeneratorRegistry {
  list(): readonly GeneratorDescription[];
  describe(key: string, version: number): GeneratorDescription | undefined;
  resolve(request: GenerateQuestionRequest): ResolvedGeneratedQuestion;
  audit(request: AuditGeneratorRequest): GeneratorAuditResult;
}
