import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@modelcontextprotocol/server/stdio', () => ({ serveStdio: vi.fn() }));

describe('Lacuna AI MCP entry point', () => {
  it('does not seize stdio when imported as a module', async () => {
    await import('./index');

    expect(serveStdio).not.toHaveBeenCalled();
  });
});
