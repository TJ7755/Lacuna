import { createServer, type Socket } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as ConnectionFile from '../../../desktop/mcp/connectionFile';
import {
  CompanionLineDecoder,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
} from '@lacuna/protocol/mcp/companion';

const launch = vi.hoisted(() => ({ unref: vi.fn(), once: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: true } }));
vi.mock('electron-log', () => ({ default: {} }));
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => launch) }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('../../../desktop/mcp/connectionFile', async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionFile>()),
  companionHostUserDataPath: vi.fn(),
  readCompanionConnectionFile: vi.fn(),
}));
import { spawn } from 'node:child_process';
import {
  companionEndpoint,
  readCompanionConnectionFile,
} from '../../../desktop/mcp/connectionFile';
import { CompanionAppClient } from '../../../desktop/mcp/companion';

describe('data companion cold start', () => {
  it('launches the absent host and waits for an authenticated socket handshake', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'lacuna-cold-'));
    await mkdir(path.join(directory, 'mcp'));
    const endpoint = companionEndpoint(directory);
    const token = 'a'.repeat(64);
    const identity = { connectionId: 'cold', name: 'test' };
    const hellos: unknown[] = [];
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
      const decoder = new CompanionLineDecoder();
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        for (const message of decoder.push(chunk)) {
          hellos.push(message);
          socket.write(
            encodeCompanionMessage({
              type: 'ready',
              appVersion: '0.2.3',
              protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
            }),
          );
        }
      });
    });
    const client = new CompanionAppClient(identity, '/host-data');
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(endpoint, resolve);
      });
      vi.mocked(readCompanionConnectionFile)
        .mockRejectedValueOnce(new Error('host absent'))
        .mockRejectedValueOnce(new Error('broker not ready'))
        .mockResolvedValue({
          endpoint,
          token,
          aiToken: 'b'.repeat(64),
          pid: 1,
          createdAt: 1,
          appVersion: '0.2.3',
          protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
        });

      const result = await client.serverInfo();

      expect(result.structuredContent).toMatchObject({ name: 'Lacuna', version: '0.2.3' });
      expect(hellos).toEqual([
        {
          type: 'hello',
          protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
          token,
          client: identity,
        },
      ]);
      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        ['--user-data-dir=/host-data'],
        expect.objectContaining({ detached: true, stdio: 'ignore' }),
      );
      expect(launch.unref).toHaveBeenCalledOnce();
    } finally {
      client.close();
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
