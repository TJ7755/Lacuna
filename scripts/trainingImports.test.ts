import { ESLint } from 'eslint';
import { resolve, relative, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const probeSource = (source: string, filePath: string) =>
  source.replace(
    /(?<=["'`])(?:\.\.\/)+(src|relay|tooling)\//g,
    (_match, area: string) =>
      relative(
        dirname(resolve(root, filePath)),
        resolve(
          root,
          area === 'src' ? 'apps/web/src' : area === 'relay' ? 'apps/relay' : 'tooling',
        ),
      ) + '/',
  );

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
      'apps/web/src/fsrs/probe.ts',
      'apps/web/src/fsrs/probe.test.ts',
      'apps/web/src/fsrs/probe.mjs',
      'apps/ai/server/ai/probe.ts',
      'apps/desktop/mcp/probe.ts',
      'apps/ai/api/ai/probe.ts',
    ]) {
      for (const source of [
        "import data from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';",
        "export * from '../../tooling/short-term-memory/coefficients/half-life-logistic-v2.json';",
        "export const load = () => import('../../tooling/short-term-memory/tests/fixtures/model-port-v3.json');",
        'export const load = () => import(`../../tooling/short-term-memory/tests/fixtures/model-port-v3.json`);',
        "export const load = () => require('../../tooling/short-term-memory/coefficients/../coefficients/half-life-logistic-v2.json?raw#probe');",
      ]) {
        const [result] = await eslint.lintText(probeSource(source, filePath), { filePath });
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
      [
        'apps/web/src/fsrs/probe.ts',
        "import data from './coefficients/half-life-logistic-v3.json';",
      ],
      [
        'apps/web/src/fsrs/halfLifeLogisticModel.test.ts',
        "import data from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';",
      ],
      [
        'apps/web/src/fsrs/halfLifeLogisticModel.test.ts',
        "import data from '../../tooling/short-term-memory/tests/fixtures/model-port-v3.json';",
      ],
      [
        'tooling/probe.ts',
        "import data from './short-term-memory/coefficients/half-life-logistic-v1.json';",
      ],
    ]) {
      const [result] = await eslint.lintText(probeSource(source, filePath), { filePath });
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
