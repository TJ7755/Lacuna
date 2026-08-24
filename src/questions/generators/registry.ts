import type {
  AuditGeneratorRequest,
  GenerateQuestionRequest,
  GeneratorAuditResult,
  GeneratorDescription,
  QuestionGeneratorRegistry,
  ResolvedGeneratedQuestion,
} from './contracts';
import { QuestionGeneratorError } from './errors';
import { deepFreeze } from './immutable';
import {
  auditIntegerRootQuadratic,
  INTEGER_ROOT_QUADRATIC_DESCRIPTION,
  parseIntegerRootQuadraticConfig,
  resolveIntegerRootQuadratic,
  type IntegerRootQuadraticConfig,
} from './integerRootQuadratic';

interface BuiltInQuestionGenerator<C> {
  readonly description: GeneratorDescription;
  parseConfiguration(value: unknown): C;
  resolve(configuration: C, seed: string): ResolvedGeneratedQuestion;
  audit(configuration: C): readonly ResolvedGeneratedQuestion[];
}

const BUILT_INS: readonly BuiltInQuestionGenerator<unknown>[] = [
  {
    description: INTEGER_ROOT_QUADRATIC_DESCRIPTION,
    parseConfiguration: parseIntegerRootQuadraticConfig,
    resolve: (configuration, seed) =>
      resolveIntegerRootQuadratic(configuration as IntegerRootQuadraticConfig, seed),
    audit: (configuration) =>
      auditIntegerRootQuadratic(configuration as IntegerRootQuadraticConfig),
  },
];

class AuditedQuestionGeneratorRegistry implements QuestionGeneratorRegistry {
  private readonly definitions = new Map(
    BUILT_INS.map((definition) => [
      registryKey(definition.description.key, definition.description.version),
      definition,
    ]),
  );

  list(): readonly GeneratorDescription[] {
    return deepFreeze(BUILT_INS.map((definition) => definition.description));
  }

  describe(key: string, version: number): GeneratorDescription | undefined {
    return this.definitions.get(registryKey(key, version))?.description;
  }

  resolve(request: GenerateQuestionRequest): ResolvedGeneratedQuestion {
    const definition = this.requireDefinition(request.generatorKey, request.generatorVersion);
    if (typeof request.seed !== 'string' || !request.seed.trim()) {
      throw new QuestionGeneratorError(
        'invalid-seed',
        request.generatorKey,
        request.generatorVersion,
        'A generated Question requires a non-blank deterministic seed.',
      );
    }
    const configuration = definition.parseConfiguration(request.configuration);
    return definition.resolve(configuration, request.seed);
  }

  audit(request: AuditGeneratorRequest): GeneratorAuditResult {
    const definition = this.requireDefinition(request.generatorKey, request.generatorVersion);
    const configuration = definition.parseConfiguration(request.configuration);
    const resolved = definition.audit(configuration);
    const fingerprints = new Set<string>();
    const instances = resolved.map((instance) => {
      if (fingerprints.has(instance.generatorFingerprint)) {
        throw new QuestionGeneratorError(
          'audit-failed',
          request.generatorKey,
          request.generatorVersion,
          'The built-in Question generator produced a duplicate presentation.',
        );
      }
      fingerprints.add(instance.generatorFingerprint);
      return deepFreeze({
        seed: instance.seed,
        generatorFingerprint: instance.generatorFingerprint,
        resolved: instance,
      });
    });
    if (instances.length === 0) {
      throw new QuestionGeneratorError(
        'exhausted-constraint-space',
        request.generatorKey,
        request.generatorVersion,
        'The Question generator configuration has no valid presentations.',
      );
    }
    return deepFreeze({
      description: definition.description,
      configuration,
      instances,
      fingerprintCount: fingerprints.size,
    });
  }

  private requireDefinition(key: string, version: number): BuiltInQuestionGenerator<unknown> {
    const definition = this.definitions.get(registryKey(key, version));
    if (definition) return definition;
    const code = BUILT_INS.some((candidate) => candidate.description.key === key)
      ? 'unsupported-version'
      : 'unknown-generator';
    throw new QuestionGeneratorError(
      code,
      key,
      version,
      code === 'unsupported-version'
        ? 'This version of the Question generator is not supported by this client.'
        : 'This Question generator is not built into this client.',
    );
  }
}

function registryKey(key: string, version: number): string {
  return `${key}\0${version}`;
}

export const questionGeneratorRegistry: QuestionGeneratorRegistry =
  new AuditedQuestionGeneratorRegistry();
