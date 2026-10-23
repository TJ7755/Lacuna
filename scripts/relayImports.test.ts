import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const rule = 'relay-contract/no-deep-imports';

describe('shared relay contract imports', () => {
  it('uses the real lint configuration to reject deep imports and permit the entry point', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parserOptions: { project: null } },
          rules: { '@typescript-eslint/no-floating-promises': 'off' },
        },
      ],
    });
    const probes = [
      ...[
        "import { INSIGHT_ID_RE } from '../../relay/src/insightsProtocol';",
        "import type { InsightEnvelope } from '../../relay/src/insightsProtocol.js';",
        "export * from '../../relay/src/insightsProtocol';",
        "export type { InsightEnvelope } from '../../relay/src/insightsProtocol';",
        "export type E = import('../../relay/src/insightsProtocol').InsightEnvelope;",
        "export const load = () => import('../../relay/src/insightsProtocol');",
        'export const load = () => import(`../../relay/src/insightsProtocol`);',
        "export const load = () => require('../../relay/src/insightsProtocol');",
        "import protocol = require('../../relay/src/insightsProtocol');",
        "export * from '../../relay/src/../src/insightsProtocol.js?raw';",
        "export * from '../../relay/shared/insights/insightsProtocol';",
        "export * from '../../relay/shared/insights/insightsDay.js';",
      ].map((source) => ({ filePath: 'src/insights/probe.ts', source, forbidden: true })),
      ...[
        'src/insights/probe.test.ts',
        'electron/mcp/probe.ts',
        'api/ai/probe.ts',
        'tests/e2e/probe.ts',
        'scripts/probe.ts',
      ].map((filePath) => ({
        filePath,
        source: `export * from '${filePath.startsWith('scripts/') ? '../' : '../../'}relay/src/store';`,
        forbidden: true,
      })),
      {
        filePath: 'src/insights/probe.ts',
        source: "export * from '../../relay/shared/insights/index.js';",
        forbidden: false,
      },
      {
        filePath: 'src/insights/probe.ts',
        source: "export * from '../../relay/shared/insights';",
        forbidden: false,
      },
      {
        filePath: 'src/insights/mailbox.test.ts',
        source: "export * from '../../relay/src/relay';",
        forbidden: false,
      },
      {
        filePath: 'src/insights/mailbox.test.ts',
        source: "export * from '../../relay/src/insightsProtocol';",
        forbidden: true,
      },
      {
        filePath: 'src/insights/mailbox.test.ts',
        source: "export * from '../../relay/src/channelMaintenance';",
        forbidden: true,
      },
      {
        filePath: 'electron/mcp/probe.ts',
        source: "export * from '../../src/insights/envelope';",
        forbidden: false,
      },
    ];
    for (const probe of probes) {
      const [result] = await eslint.lintText(probe.source, { filePath: probe.filePath });
      expect(
        result.messages.filter((message) => message.fatal),
        probe.source,
      ).toEqual([]);
      expect(
        result.messages.filter((message) => message.ruleId === rule),
        probe.source,
      ).toHaveLength(Number(probe.forbidden));
    }
  }, 30_000);
});
