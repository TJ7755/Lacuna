import { describe, expect, it } from 'vitest';
import { runWorkingFixtures } from '../../items/fixtureRunner';
import { itemPayloadIsValid } from '../../items/payloadValidation';
import {
  INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
  INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
  QuestionGeneratorError,
  questionGeneratorRegistry,
  type IntegerRootQuadraticConfig,
} from './index';

const configuration: IntegerRootQuadraticConfig = {
  minimumRootMagnitude: 1,
  maximumRootMagnitude: 2,
  maximumLeadingCoefficient: 2,
  allowRepeatedRoots: true,
};

function request(seed: string) {
  return {
    generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
    generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
    configuration,
    seed,
  } as const;
}

function expectGeneratorError(action: () => unknown, code: QuestionGeneratorError['code']): void {
  try {
    action();
    throw new Error('Expected generator resolution to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(QuestionGeneratorError);
    expect((error as QuestionGeneratorError).code).toBe(code);
  }
}

describe('questionGeneratorRegistry', () => {
  it('describes only the audited built-in generator version', () => {
    expect(
      questionGeneratorRegistry.describe(
        INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
        INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      ),
    ).toMatchObject({
      key: 'integer-root-quadratic',
      version: 1,
      name: 'Integer-root quadratic equations',
    });
    expect(questionGeneratorRegistry.describe('missing', 1)).toBeUndefined();
    expect(
      questionGeneratorRegistry.describe(INTEGER_ROOT_QUADRATIC_GENERATOR_KEY, 2),
    ).toBeUndefined();
  });

  it('throws typed, non-executable errors for unknown keys and unsupported versions', () => {
    expectGeneratorError(
      () =>
        questionGeneratorRegistry.resolve({
          ...request('seed'),
          generatorKey: '<script>alert(1)</script>',
        }),
      'unknown-generator',
    );
    expectGeneratorError(
      () => questionGeneratorRegistry.resolve({ ...request('seed'), generatorVersion: 999 }),
      'unsupported-version',
    );
  });

  it('rejects malformed, out-of-bound and widened configurations', () => {
    const invalidConfigurations: unknown[] = [
      null,
      {},
      { ...configuration, minimumRootMagnitude: 0 },
      { ...configuration, maximumRootMagnitude: 21 },
      { ...configuration, minimumRootMagnitude: 3, maximumRootMagnitude: 2 },
      { ...configuration, maximumLeadingCoefficient: 10 },
      { ...configuration, allowRepeatedRoots: 'yes' },
      { ...configuration, executable: 'return process.env' },
    ];

    for (const candidate of invalidConfigurations) {
      expectGeneratorError(
        () => questionGeneratorRegistry.resolve({ ...request('seed'), configuration: candidate }),
        'invalid-configuration',
      );
    }
    expectGeneratorError(() => questionGeneratorRegistry.resolve(request('   ')), 'invalid-seed');
  });

  it('reproduces byte-equivalent, deeply immutable receipts for the same seed', () => {
    const first = questionGeneratorRegistry.resolve(request('same-seed'));
    const second = questionGeneratorRegistry.resolve(request('same-seed'));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parameters)).toBe(true);
    expect(Object.isFrozen(first.resolvedPayload)).toBe(true);
    expect(Object.isFrozen(first.resolvedPayload.fixtures)).toBe(true);
    if (first.resolvedPayload.kind === 'working') {
      expect(Object.isFrozen(first.resolvedPayload.scheme)).toBe(true);
      expect(Object.isFrozen(first.resolvedPayload.scheme[0])).toBe(true);
    }
  });

  it('renders the expanded equation and derives marking and feedback from its factors', () => {
    const resolved = questionGeneratorRegistry.resolve({
      ...request('only-presentation'),
      configuration: {
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 1,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      },
    });

    expect(resolved.renderedPrompt).toBe(
      'Solve $x^2 - 1 = 0$. Enter each distinct real root on a separate line.',
    );
    expect(resolved.parameters).toEqual({
      leadingCoefficient: 1,
      linearCoefficient: 0,
      constantCoefficient: -1,
      root1: -1,
      root2: 1,
      distinctRootCount: 2,
    });
    expect(resolved.resolvedPayload).toMatchObject({
      kind: 'working',
      scheme: [
        { predicate: 'equals', args: ['-1'] },
        { predicate: 'equals', args: ['1'] },
      ],
    });
    expect(resolved.renderedExplanation).toContain('(x + 1)(x - 1)');
    expect(resolved.renderedExplanation).toContain('$x = -1$ or $x = 1$');
  });

  it('varies eligible seeds without producing degenerate or ambiguous equations', () => {
    const audit = questionGeneratorRegistry.audit({
      generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
      generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      configuration,
    });

    expect(audit.instances).toHaveLength(20);
    expect(new Set(audit.instances.map((entry) => entry.generatorFingerprint)).size).toBe(20);
    expect(new Set(audit.instances.map((entry) => entry.resolved.renderedPrompt)).size).toBe(20);

    for (const entry of audit.instances) {
      const parameters = entry.resolved.parameters;
      const a = parameters.leadingCoefficient as number;
      const b = parameters.linearCoefficient as number;
      const c = parameters.constantCoefficient as number;
      const root1 = parameters.root1 as number;
      const root2 = parameters.root2 as number;

      expect(a).toBeGreaterThan(0);
      expect(a * root1 * root2).toBe(c);
      expect(root1 + root2 === 0 ? 0 : -a * (root1 + root2)).toBe(b);
      expect(b * b - 4 * a * c).toBe(a * a * (root1 - root2) ** 2);
      expect(itemPayloadIsValid(entry.resolved.resolvedPayload)).toBe(true);
      expect(entry.resolved.resolvedPayload.kind).toBe('working');
      if (entry.resolved.resolvedPayload.kind === 'working') {
        expect(
          runWorkingFixtures(
            entry.resolved.resolvedPayload.scheme,
            entry.resolved.resolvedPayload.fixtures ?? [],
          ).every((fixture) => fixture.passes),
        ).toBe(true);
      }
      expect(JSON.stringify(questionGeneratorRegistry.resolve(request(entry.seed)))).toBe(
        JSON.stringify(entry.resolved),
      );
    }
  });

  it('audits every finite presentation deterministically, including parameter boundaries', () => {
    const first = questionGeneratorRegistry.audit({
      generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
      generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      configuration,
    });
    const second = questionGeneratorRegistry.audit({
      generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
      generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      configuration,
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.instances)).toBe(true);
    expect(first.instances[0].resolved.parameters).toEqual({
      leadingCoefficient: 1,
      linearCoefficient: 4,
      constantCoefficient: 4,
      root1: -2,
      root2: -2,
      distinctRootCount: 1,
    });
    expect(first.instances[first.instances.length - 1].resolved.parameters).toEqual({
      leadingCoefficient: 2,
      linearCoefficient: -8,
      constantCoefficient: 8,
      root1: 2,
      root2: 2,
      distinctRootCount: 1,
    });
  });

  it('can exclude repeated roots without relying on retry loops', () => {
    const audit = questionGeneratorRegistry.audit({
      generatorKey: INTEGER_ROOT_QUADRATIC_GENERATOR_KEY,
      generatorVersion: INTEGER_ROOT_QUADRATIC_GENERATOR_VERSION,
      configuration: { ...configuration, allowRepeatedRoots: false },
    });

    expect(audit.instances).toHaveLength(12);
    expect(
      audit.instances.every(
        (entry) => entry.resolved.parameters.root1 !== entry.resolved.parameters.root2,
      ),
    ).toBe(true);
  });

  it('accepts the documented bounds and rejects values immediately beyond them', () => {
    expect(() =>
      questionGeneratorRegistry.resolve({
        ...request('boundary'),
        configuration: {
          minimumRootMagnitude: 20,
          maximumRootMagnitude: 20,
          maximumLeadingCoefficient: 9,
          allowRepeatedRoots: true,
        },
      }),
    ).not.toThrow();
    expectGeneratorError(
      () =>
        questionGeneratorRegistry.resolve({
          ...request('boundary'),
          configuration: { ...configuration, maximumRootMagnitude: 21 },
        }),
      'invalid-configuration',
    );
  });
});
