import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('packaged local AI companion', () => {
  it('registers only the five AI-session tools', async () => {
    const source = await readFile(path.join(process.cwd(), 'electron/mcp/aiCompanion.ts'), 'utf8');
    const tools = [...source.matchAll(/server\.registerTool\(\s*'([^']+)'/g)]
      .map((match) => match[1]);

    expect(tools).toEqual([
      'lacuna.connect',
      'lacuna.wait_for_message',
      'lacuna.invoke_tool',
      'lacuna.reply',
      'lacuna.disconnect',
    ]);
    expect(source).not.toContain('TOOL_REGISTRY');
    expect(source).not.toContain("from '../../src/mcp/registry");
  });

  it('is included in the Electron companion bundle', async () => {
    const buildSource = await readFile(path.join(process.cwd(), 'electron/mcp/build.mjs'), 'utf8');
    expect(buildSource).toContain("aiCompanion: path.join(__dirname, 'aiCompanion.ts')");
  });
});
