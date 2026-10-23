import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

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
      'electron/mcp/probe.ts',
      'electron/mcp/probe.test.ts',
      'api/ai/probe.ts',
      'api/ai/probe.mjs',
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
        const [result] = await eslint.lintText(source, { filePath });
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
      ['electron/mcp/probe.ts', 'mcp/contractEntry.js', false],
      ['electron/mcp/probe.ts', 'mcp/bridgeEntry', false],
      ['electron/mcp/probe.ts', 'mcp/companionEntry.js?raw', false],
      ['electron/mcp/probe.ts', 'ai/companionEntry', false],
      ['api/ai/probe.ts', 'jev/apiEntry.js', false],
      ['api/ai/probe.ts', 'mcp/bridgeEntry', true],
      ['electron/mcp/probe.ts', 'jev/apiEntry', true],
      ['src/mcp/probe.ts', 'mcp/grants', false],
    ] as const) {
      const [result] = await eslint.lintText(`export * from '../../src/${target}';`, { filePath });
      expect(result.messages.filter((message) => message.fatal)).toEqual([]);
      expect(
        result.messages.filter((message) => message.ruleId === 'app-contract/no-deep-imports'),
        `${filePath}: ${target}`,
      ).toHaveLength(Number(forbidden));
    }
  }, 30_000);
});
