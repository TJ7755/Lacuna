import { runWorkingFixtures } from '../../items/fixtureRunner';
import { itemPayloadIsValid } from '../../items/payloadValidation';
import {
  CURRENT_ITEM_PAYLOAD_VERSION,
  type ItemFixture,
  type MarkSchemeLine,
  type QuestionPayload,
} from '@lacuna/core/items/types';
import type {
  GeneratorDescription,
  GeneratorQuestionSpace,
  ResolvedGeneratedQuestion,
} from './contracts';
import { QuestionGeneratorError } from './errors';
import { deepFreeze } from './immutable';
import { SeededRandom } from '@lacuna/core/questions/generators/seededRandom';

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
  const space = integerRootQuadraticSpace(configuration);
  const index = corpusIndex(seed, space.capacity);
  return deepFreeze({ ...space.resolve(index), seed });
}

export function auditIntegerRootQuadratic(
  configuration: IntegerRootQuadraticConfig,
): readonly ResolvedGeneratedQuestion[] {
  const space = integerRootQuadraticSpace(configuration);
  return deepFreeze(
    Array.from({ length: space.capacity }, (_, index) => {
      const resolved = space.resolve(index);
      assertAuditable(resolved);
      return resolved;
    }),
  );
}

export function integerRootQuadraticSpace(
  configuration: IntegerRootQuadraticConfig,
): GeneratorQuestionSpace {
  const roots: number[] = [];
  for (
    let magnitude = configuration.minimumRootMagnitude;
    magnitude <= configuration.maximumRootMagnitude;
    magnitude++
  ) {
    roots.push(-magnitude, magnitude);
  }
  roots.sort((a, b) => a - b);
  const width = configuration.maximumLeadingCoefficient;
  const capacity =
    ((roots.length * (roots.length + (configuration.allowRepeatedRoots ? 1 : -1))) / 2) * width;
  if (!capacity) throw exhaustedConstraintSpace();
  const rowLength = (first: number) =>
    roots.length - first - (configuration.allowRepeatedRoots ? 0 : 1);
  const parametersAt = (index: number): QuadraticParameters => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= capacity)
      throw new RangeError('Question generator index is outside its capacity.');
    const leadingCoefficient = (index % width) + 1;
    let pair = Math.floor(index / width);
    let first = 0;
    while (pair >= rowLength(first)) pair -= rowLength(first++);
    const root1 = roots[first];
    const root2 = roots[first + pair + (configuration.allowRepeatedRoots ? 0 : 1)];
    return {
      leadingCoefficient,
      linearCoefficient: normaliseZero(-leadingCoefficient * (root1 + root2)),
      constantCoefficient: leadingCoefficient * root1 * root2,
      root1,
      root2,
      distinctRootCount: root1 === root2 ? 1 : 2,
    };
  };
  return {
    capacity,
    resolve: (index) => renderIntegerRootQuadratic(parametersAt(index), auditSeed(index)),
    indexOfPrompt(prompt) {
      const match =
        /^Solve \$(\d*)x\^2(?: ([+-]) (\d*)x)? ([+-]) (\d+) = 0\$\. Enter each distinct real root on a separate line\.$/.exec(
          prompt,
        );
      if (!match) return undefined;
      const a = Number(match[1] || 1);
      const b = match[2] ? (match[2] === '-' ? -1 : 1) * Number(match[3] || 1) : 0;
      const c = (match[4] === '-' ? -1 : 1) * Number(match[5]);
      const discriminant = Math.sqrt(b * b - 4 * a * c);
      const first = roots.indexOf((-b - discriminant) / (2 * a));
      const second = roots.indexOf((-b + discriminant) / (2 * a));
      if (
        a < 1 ||
        a > width ||
        first < 0 ||
        second < 0 ||
        (!configuration.allowRepeatedRoots && first === second)
      )
        return undefined;
      let pair = second - first - (configuration.allowRepeatedRoots ? 0 : 1);
      for (let row = 0; row < first; row++) pair += rowLength(row);
      const index = pair * width + a - 1;
      // Reject non-canonical spellings, including leading zeroes and explicit unit coefficients.
      return renderPrompt(parametersAt(index)) === prompt ? index : undefined;
    },
  };
}

function renderPrompt(parameters: QuadraticParameters): string {
  return `Solve $${renderPolynomial(parameters)} = 0$. Enter each distinct real root on a separate line.`;
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
  const renderedPrompt = renderPrompt(parameters);
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
