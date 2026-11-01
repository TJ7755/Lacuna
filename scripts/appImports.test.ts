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

describe('cross-runtime app entry points', () => {
  it('rejects deep app imports through the real lint configuration', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfig: [
        {
          files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
          languageOptions: { parserOptions: { project: null } },
          rules: { '@typescript-eslint/no-floating-promises': 'off' },
        },
      ],
    });
    for (const filePath of [
      'apps/desktop/mcp/probe.ts',
      'apps/desktop/mcp/probe.test.ts',
      'apps/ai/api/ai/probe.ts',
      'apps/ai/api/ai/probe.mjs',
    ]) {
      for (const source of [
        "import { GrantStore } from '../../src/mcp/grants';",
        "import type { McpGrant } from '../../src/mcp/types.js';",
        "export * from '../../src/mcp/contracts/registry';",
        "export type { McpGrant } from '../../src/mcp/types';",
        "export type T = import('../../src/mcp/types').McpGrant;",
        "export const load = () => import('../../src/mcp/grants');",
        'export const load = () => import(`../../src/mcp/grants`);',
        "export const load = () => require('../../src/mcp/grants');",
        "import grants = require('../../src/mcp/grants');",
        "export * from '../../src/mcp/../mcp/grants.js?raw#test';",
        "export * from '../../src/pages/LearnMode';",
      ].filter(
        (source) =>
          !filePath.endsWith('.mjs') ||
          (!source.includes('type ') && !source.includes('import grants =')),
      )) {
        const [result] = await eslint.lintText(probeSource(source, filePath), { filePath });
        expect(
          result.messages.filter((message) => message.fatal),
          source,
        ).toEqual([]);
        expect(
          result.messages.filter((message) => message.ruleId === 'app-contract/no-deep-imports'),
          `${filePath}: ${source}`,
        ).toHaveLength(1);
      }
    }
    for (const [filePath, target, forbidden] of [
      ['apps/desktop/mcp/probe.ts', 'mcp/contractEntry.js', false],
      ['apps/desktop/mcp/probe.ts', 'mcp/bridgeEntry', false],
      ['apps/desktop/mcp/probe.ts', 'mcp/companionEntry.js?raw', false],
      ['apps/desktop/mcp/probe.ts', 'ai/protocol', false],
      ['apps/desktop/mcp/probe.ts', 'ai/companionErrors.js', false],
      ['apps/ai/api/ai/probe.ts', 'ai/companionErrors.js', true],
      ['apps/ai/api/ai/probe.ts', 'ai/protocol.js', true],
      ['apps/ai/api/ai/probe.ts', 'jev/apiEntry.js', false],
      ['apps/ai/api/ai/probe.ts', 'mcp/bridgeEntry', true],
      ['apps/desktop/mcp/probe.ts', 'jev/apiEntry', true],
      ['apps/web/src/mcp/probe.ts', 'mcp/grants', false],
    ] as const) {
      const [result] = await eslint.lintText(
        probeSource(`export * from '../../src/${target}';`, filePath),
        { filePath },
      );
      expect(result.messages.filter((message) => message.fatal)).toEqual([]);
      expect(
        result.messages.filter((message) => message.ruleId === 'app-contract/no-deep-imports'),
        `${filePath}: ${target}`,
      ).toHaveLength(Number(forbidden));
    }
  }, 30_000);
});
