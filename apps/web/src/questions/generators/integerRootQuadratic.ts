import { runWorkingFixtures } from '../../items/fixtureRunner';
import { itemPayloadIsValid } from '../../items/payloadValidation';
import {
  CURRENT_ITEM_PAYLOAD_VERSION,
  type ItemFixture,
  type MarkSchemeLine,
  type QuestionPayload,
} from '../../items/types';
import type { GeneratorDescription, ResolvedGeneratedQuestion } from './contracts';
import { QuestionGeneratorError } from './errors';
import { deepFreeze } from './immutable';
import { SeededRandom } from './seededRandom';

export const INTEGER_ROOT_QUADRATIC_GENERATOR_KEY = 'integer-root-quadratic' as const;
export const INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION = 1 as const;

const MAXIMUM_ROOT_MAGNITUDE = 20;
const MAXIMUM_LEADING_COEFFICIENT = 9;
const AUDIT_SEED_PREFIX = `${INTEGER_ROOT_QUADRATIC_GENERATOR_KEY}@${INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION}:corpus:`;

export interface IntegerRootQuadraticConfig {
  minimumRootMagnitude: number;
  maximumRootMagnitude: number;
  maximumLeadingCoefficient: number;
  allowRepeatedRoots: boolean;
}

interface QuadraticParameters {
  leadingCoefficient: number;
  linearCoefficient: number;
  constantCoefficient: number;
  root1: number;
  root2: number;
  distinctRootCount: number;
}

export const INTEGER_ROOT_QUADRATIC_DESCRIPTION: GeneratorDescription = deepFreeze({
  key: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
  version: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
  name: 'Integer-root quadratic equations',
  summary: 'Expanded quadratic equations constructed from one or two non-zero integer roots.',
  configurationFields: [
    {
      key: 'minimumRootMagnitude',
      label: 'Minimum root magnitude',
      kind: 'integer',
      minimum: 1,
      maximum: MAXIMUM_ROOT_MAGNITUDE,
    },
    {
      key: 'maximumRootMagnitude',
      label: 'Maximum root magnitude',
      kind: 'integer',
      minimum: 1,
      maximum: MAXIMUM_ROOT_MAGNITUDE,
    },
    {
      key: 'maximumLeadingCoefficient',
      label: 'Maximum leading coefficient',
      kind: 'integer',
      minimum: 1,
      maximum: MAXIMUM_LEADING_COEFFICIENT,
    },
    {
      key: 'allowRepeatedRoots',
      label: 'Allow repeated roots',
      kind: 'boolean',
    },
  ],
});

export function parseIntegerRootQuadraticConfig(value: unknown): IntegerRootQuadraticConfig {
  if (!isPlainDataRecord(value)) throw invalidConfiguration();
  const expectedKeys = [
    'allowRepeatedRoots',
    'maximumLeadingCoefficient',
    'maximumRootMagnitude',
    'minimumRootMagnitude',
  ];
  if (Object.keys(value).sort().join('\0') !== expectedKeys.join('\0')) {
    throw invalidConfiguration();
  }

  const minimumRootMagnitude = value.minimumRootMagnitude;
  const maximumRootMagnitude = value.maximumRootMagnitude;
  const maximumLeadingCoefficient = value.maximumLeadingCoefficient;
  const allowRepeatedRoots = value.allowRepeatedRoots;
  if (
    !integerInRange(minimumRootMagnitude, 1, MAXIMUM_ROOT_MAGNITUDE) ||
    !integerInRange(maximumRootMagnitude, 1, MAXIMUM_ROOT_MAGNITUDE) ||
    minimumRootMagnitude > maximumRootMagnitude ||
    !integerInRange(maximumLeadingCoefficient, 1, MAXIMUM_LEADING_COEFFICIENT) ||
    typeof allowRepeatedRoots !== 'boolean'
  ) {
    throw invalidConfiguration();
  }

  return deepFreeze({
    minimumRootMagnitude,
    maximumRootMagnitude,
    maximumLeadingCoefficient,
    allowRepeatedRoots,
  });
}

export function resolveIntegerRootQuadratic(
  configuration: IntegerRootQuadraticConfig,
  seed: string,
): ResolvedGeneratedQuestion {
  const candidates = enumerateIntegerRootQuadratics(configuration);
  if (candidates.length === 0) throw exhaustedConstraintSpace();
  const index = corpusIndex(seed, candidates.length);
  return renderIntegerRootQuadratic(candidates[index], seed);
}

export function auditIntegerRootQuadratic(
  configuration: IntegerRootQuadraticConfig,
): readonly ResolvedGeneratedQuestion[] {
  const candidates = enumerateIntegerRootQuadratics(configuration);
  if (candidates.length === 0) throw exhaustedConstraintSpace();
  return deepFreeze(
    candidates.map((parameters, index) => {
      const resolved = renderIntegerRootQuadratic(parameters, auditSeed(index));
      assertAuditable(resolved);
      return resolved;
    }),
  );
}

function enumerateIntegerRootQuadratics(
  configuration: IntegerRootQuadraticConfig,
): QuadraticParameters[] {
  const rootValues: number[] = [];
  for (
    let magnitude = configuration.minimumRootMagnitude;
    magnitude <= configuration.maximumRootMagnitude;
    magnitude += 1
  ) {
    rootValues.push(-magnitude, magnitude);
  }
  rootValues.sort((left, right) => left - right);

  const candidates: QuadraticParameters[] = [];
  for (let firstIndex = 0; firstIndex < rootValues.length; firstIndex += 1) {
    const secondStart = configuration.allowRepeatedRoots ? firstIndex : firstIndex + 1;
    for (let secondIndex = secondStart; secondIndex < rootValues.length; secondIndex += 1) {
      const root1 = rootValues[firstIndex];
      const root2 = rootValues[secondIndex];
      for (
        let leadingCoefficient = 1;
        leadingCoefficient <= configuration.maximumLeadingCoefficient;
        leadingCoefficient += 1
      ) {
        candidates.push({
          leadingCoefficient,
          linearCoefficient: normaliseZero(-leadingCoefficient * (root1 + root2)),
          constantCoefficient: leadingCoefficient * root1 * root2,
          root1,
          root2,
          distinctRootCount: root1 === root2 ? 1 : 2,
        });
      }
    }
  }
  return candidates;
}

function renderIntegerRootQuadratic(
  parameters: QuadraticParameters,
  seed: string,
): ResolvedGeneratedQuestion {
  const polynomial = renderPolynomial(parameters);
  const uniqueRoots =
    parameters.root1 === parameters.root2
      ? [parameters.root1]
      : [parameters.root1, parameters.root2];
  const factorisation = renderFactorisation(parameters);
  const renderedPrompt = `Solve $${polynomial} = 0$. Enter each distinct real root on a separate line.`;
  const renderedExplanation =
    uniqueRoots.length === 1
      ? [
          'Use the factorisation constructed from the root:',
          `$$${polynomial} = ${factorisation}.$$`,
          `The repeated factor is zero when $x = ${formatInteger(uniqueRoots[0])}$, so this is the only distinct root.`,
        ].join('\n\n')
      : [
          'Use the factorisation constructed from the roots:',
          `$$${polynomial} = ${factorisation}.$$`,
          `Set each factor to zero. This gives $x = ${formatInteger(uniqueRoots[0])}$ or $x = ${formatInteger(uniqueRoots[1])}$.`,
        ].join('\n\n');
  const resolvedPayload = makePayload(uniqueRoots);

  return deepFreeze({
    generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
    generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
    seed,
    parameters: {
      leadingCoefficient: parameters.leadingCoefficient,
      linearCoefficient: parameters.linearCoefficient,
      constantCoefficient: parameters.constantCoefficient,
      root1: parameters.root1,
      root2: parameters.root2,
      distinctRootCount: parameters.distinctRootCount,
    },
    generatorFingerprint: [
      `${INTEGER_ROOT_QUADRATIC_GENERATOR_KEY}@${INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION}`,
      parameters.leadingCoefficient,
      parameters.linearCoefficient,
      parameters.constantCoefficient,
    ].join(':'),
    renderedPrompt,
    resolvedPayload,
    renderedExplanation,
  });
}

function makePayload(uniqueRoots: number[]): QuestionPayload {
  const scheme: MarkSchemeLine[] = uniqueRoots.map((root, index) => ({
    marks: 1,
    label: uniqueRoots.length === 1 ? 'Repeated root' : `Root ${index + 1}`,
    kind: 'predicate',
    predicate: 'equals',
    args: [formatInteger(root)],
  }));
  const fixtures: ItemFixture[] = [
    {
      id: 'all-roots-in-order',
      studentAnswer: uniqueRoots.map(formatInteger),
      expectedMarks: uniqueRoots.length,
    },
  ];
  if (uniqueRoots.length === 2) {
    fixtures.push(
      {
        id: 'all-roots-reversed',
        studentAnswer: [...uniqueRoots].reverse().map(formatInteger),
        expectedMarks: 2,
      },
      {
        id: 'one-root-only',
        studentAnswer: [formatInteger(uniqueRoots[0])],
        expectedMarks: 1,
      },
    );
  }
  const wrongRoot = Math.max(...uniqueRoots.map(Math.abs)) + 1;
  fixtures.push({
    id: 'unrelated-root',
    studentAnswer: [formatInteger(wrongRoot)],
    expectedMarks: 0,
  });
  return {
    v: CURRENT_ITEM_PAYLOAD_VERSION,
    kind: 'working',
    scheme,
    fixtures,
  };
}

function renderPolynomial(parameters: QuadraticParameters): string {
  const leading =
    parameters.leadingCoefficient === 1 ? 'x^2' : `${parameters.leadingCoefficient}x^2`;
  return [
    leading,
    renderSignedTerm(parameters.linearCoefficient, 'x'),
    renderSignedTerm(parameters.constantCoefficient, ''),
  ].join('');
}

function renderSignedTerm(coefficient: number, variable: string): string {
  if (coefficient === 0) return '';
  const magnitude = Math.abs(coefficient);
  const renderedMagnitude = variable && magnitude === 1 ? '' : String(magnitude);
  return ` ${coefficient < 0 ? '-' : '+'} ${renderedMagnitude}${variable}`;
}

function renderFactorisation(parameters: QuadraticParameters): string {
  const leading = parameters.leadingCoefficient === 1 ? '' : String(parameters.leadingCoefficient);
  const first = renderFactor(parameters.root1);
  if (parameters.root1 === parameters.root2) return `${leading}${first}^2`;
  return `${leading}${first}${renderFactor(parameters.root2)}`;
}

function renderFactor(root: number): string {
  return root < 0 ? `(x + ${Math.abs(root)})` : `(x - ${root})`;
}

function formatInteger(value: number): string {
  return String(value);
}

function normaliseZero(value: number): number {
  return value === 0 ? 0 : value;
}

function corpusIndex(seed: string, candidateCount: number): number {
  if (seed.startsWith(AUDIT_SEED_PREFIX)) {
    const candidate = Number(seed.slice(AUDIT_SEED_PREFIX.length));
    if (Number.isSafeInteger(candidate) && candidate >= 0 && candidate < candidateCount) {
      return candidate;
    }
  }
  return new SeededRandom(seed).integer(candidateCount);
}

function auditSeed(index: number): string {
  return `${AUDIT_SEED_PREFIX}${index}`;
}

function assertAuditable(resolved: ResolvedGeneratedQuestion): void {
  if (
    !resolved.renderedPrompt.trim() ||
    !resolved.renderedExplanation.trim() ||
    !itemPayloadIsValid(resolved.resolvedPayload) ||
    resolved.resolvedPayload.kind !== 'working' ||
    !resolved.resolvedPayload.fixtures?.length ||
    !runWorkingFixtures(resolved.resolvedPayload.scheme, resolved.resolvedPayload.fixtures).every(
      (fixture) => fixture.passes,
    )
  ) {
    throw new QuestionGeneratorError(
      'audit-failed',
      INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
      INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      'The built-in Question generator failed its deterministic audit.',
    );
  }
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
  );
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
  );
}

function invalidConfiguration(): QuestionGeneratorError {
  return new QuestionGeneratorError(
    'invalid-configuration',
    INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
    INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
    'The integer-root quadratic configuration is invalid.',
  );
}

function exhaustedConstraintSpace(): QuestionGeneratorError {
  return new QuestionGeneratorError(
    'exhausted-constraint-space',
    INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
    INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
    'The integer-root quadratic configuration has no valid presentations.',
  );
}
