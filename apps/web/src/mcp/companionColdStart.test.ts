import { describe, expect, it, vi } from 'vitest';

const launch = vi.hoisted(() => ({ unref: vi.fn(), once: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: true } }));
vi.mock('electron-log', () => ({ default: {} }));
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => launch) }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('../../../desktop/mcp/connectionFile', () => ({
  companionHostUserDataPath: vi.fn(),
  readCompanionConnectionFile: vi.fn(),
}));
import { spawn } from 'node:child_process';
import { CompanionAppClient } from '../../../desktop/mcp/companion';

describe('data companion cold start', () => {
  it('launches the absent host and retries until the authenticated endpoint is ready', async () => {
    const client = new CompanionAppClient({ connectionId: 'cold', name: 'test' }, '/host-data');
    const endpoint = vi
      .spyOn(client as unknown as { openEndpoint(): Promise<void> }, 'openEndpoint')
      .mockRejectedValueOnce(new Error('host absent'))
      .mockRejectedValueOnce(new Error('broker not ready'))
      .mockResolvedValueOnce();
    await client.serverInfo();
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['--user-data-dir=/host-data'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(endpoint).toHaveBeenCalledTimes(3);
    expect(launch.unref).toHaveBeenCalledOnce();
    client.close();
  });
});
