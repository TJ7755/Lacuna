import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ registerTool: vi.fn() }));
vi.mock('electron-log', () => ({ default: { transports: { console: { level: false } } } }));
vi.mock('@modelcontextprotocol/server', () => ({
  McpServer: class {
    server = {};
    registerTool = sdk.registerTool;
  },
}));
vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: (create: () => unknown) => {
    create();
    return { close: vi.fn() };
  },
}));
vi.mock('esbuild', () => ({
  build: vi.fn(async () => ({ metafile: { inputs: {} } })),
}));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
import { build } from 'esbuild';
import { startAiCompanion } from '../../../desktop/mcp/aiCompanion';

describe('packaged local AI companion', () => {
  it('registers only the five AI-session tools with the SDK', () => {
    // Startup reserves stdout for MCP; restore the runner's console afterwards.
    // eslint-disable-next-line no-console
    const original = { log: console.log, info: console.info, debug: console.debug };
    try {
      startAiCompanion({ appVersion: '0.2.3', hostUserDataPath: '/host-data' });
      expect(sdk.registerTool.mock.calls.map(([name]) => name)).toEqual([
        'lacuna.connect',
        'lacuna.wait_for_message',
        'lacuna.invoke_tool',
        'lacuna.reply',
        'lacuna.disconnect',
      ]);
    } finally {
      Object.assign(console, original);
    }
  });

  it('includes the AI companion in the production build entry points', async () => {
    await import(path.join(process.cwd(), 'apps/desktop/mcp/build.mjs'));
    const options = vi.mocked(build).mock.calls[0][0];
    expect(
      Object.values(options.entryPoints ?? {}).map((entry) => path.basename(String(entry))),
    ).toContain('aiCompanion.ts');
  });
});
