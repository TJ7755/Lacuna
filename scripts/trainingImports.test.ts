import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const rule = 'training-contract/no-deep-imports';

describe('runtime coefficient asset', () => {
  it('rejects training internals and permits the shipped asset through the real lint configuration', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfig: [
        {
          files: ['**/*.{ts,mjs}'],
          languageOptions: { parserOptions: { project: null } },
          rules: { '@typescript-eslint/no-floating-promises': 'off' },
        },
      ],
    });
    for (const filePath of [
      'src/fsrs/probe.ts',
      'src/fsrs/probe.test.ts',
      'src/fsrs/probe.mjs',
      'server/ai/probe.ts',
      'electron/mcp/probe.ts',
      'api/ai/probe.ts',
    ]) {
      for (const source of [
        "import data from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';",
        "export * from '../../tooling/short-term-memory/coefficients/half-life-logistic-v2.json';",
        "export const load = () => import('../../tooling/short-term-memory/tests/fixtures/model-port-v3.json');",
        'export const load = () => import(`../../tooling/short-term-memory/tests/fixtures/model-port-v3.json`);',
        "export const load = () => require('../../tooling/short-term-memory/coefficients/../coefficients/half-life-logistic-v2.json?raw#probe');",
      ]) {
        const [result] = await eslint.lintText(source, { filePath });
        expect(
          result.messages.filter((message) => message.fatal),
          source,
        ).toEqual([]);
        expect(
          result.messages.filter((message) => message.ruleId === rule),
          `${filePath}: ${source}`,
        ).toHaveLength(1);
      }
    }
    for (const [filePath, source] of [
      ['src/fsrs/probe.ts', "import data from './coefficients/half-life-logistic-v3.json';"],
      [
        'src/fsrs/halfLifeLogisticModel.test.ts',
        "import data from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';",
      ],
      [
        'src/fsrs/halfLifeLogisticModel.test.ts',
        "import data from '../../tooling/short-term-memory/tests/fixtures/model-port-v3.json';",
      ],
      [
        'tooling/probe.ts',
        "import data from './short-term-memory/coefficients/half-life-logistic-v1.json';",
      ],
    ]) {
      const [result] = await eslint.lintText(source, { filePath });
      expect(
        result.messages.filter((message) => message.fatal),
        source,
      ).toEqual([]);
      expect(
        result.messages.filter((message) => message.ruleId === rule),
        source,
      ).toEqual([]);
    }
  }, 30_000);
});
