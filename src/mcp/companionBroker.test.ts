import { connect, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  AI_COMPANION_PROTOCOL_VERSION,
  LEGACY_AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  encodeCompanionMessage,
} from './companionProtocol';
import {
  companionConnectionFilePath,
  readCompanionConnectionFile,
} from '../../electron/mcp/connectionFile';

const electron = vi.hoisted(() => {
  type Listener = (event: unknown, value: unknown) => void;
  type Handler = (event: unknown, ...args: unknown[]) => unknown;
  const listeners = new Map<string, Set<Listener>>();
  const handlers = new Map<string, Handler>();
  return {
    userDataPath: '',
    listeners,
    handlers,
    ipcMain: {
      on(channel: string, listener: Listener) {
        const current = listeners.get(channel) ?? new Set();
        current.add(listener);
        listeners.set(channel, current);
      },
      removeListener(channel: string, listener: Listener) {
        listeners.get(channel)?.delete(listener);
      },
      handle(channel: string, handler: Handler) {
        handlers.set(channel, handler);
      },
      removeHandler(channel: string) {
        handlers.delete(channel);
      },
    },
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => electron.userDataPath,
    getVersion: () => '0.2.3',
  },
  ipcMain: electron.ipcMain,
}));

vi.mock('electron-log', () => ({
  default: { warn: vi.fn() },
}));

import { CompanionBroker } from '../../electron/mcp/companionBroker';

interface SocketClient {
  socket: Socket;
  send(value: unknown): void;
  next(): Promise<unknown>;
}

const temporaryDirectories: string[] = [];
const activeBrokers: CompanionBroker[] = [];
const sockets: Socket[] = [];

function rendererWindow() {
  const eventListeners = new Map<string, Set<() => void>>();
  const webContents = {
    mainFrame: {},
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    send: vi.fn(),
    on(event: string, listener: () => void) {
      const current = eventListeners.get(event) ?? new Set();
      current.add(listener);
      eventListeners.set(event, current);
    },
    off(event: string, listener: () => void) {
      eventListeners.get(event)?.delete(listener);
    },
  };
  return {
    window: { isDestroyed: () => false, webContents } as unknown as BrowserWindow,
    webContents,
  };
}

async function openClient(endpoint: string): Promise<SocketClient> {
  const socket = connect(endpoint);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const decoder = new CompanionLineDecoder();
  const queued: unknown[] = [];
  const waiting: Array<(value: unknown) => void> = [];
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    for (const message of decoder.push(chunk)) {
      const resolve = waiting.shift();
      if (resolve) resolve(message);
      else queued.push(message);
    }
  });
  return {
    socket,
    send(value) {
      socket.write(encodeCompanionMessage(value as never));
    },
    next() {
      const value = queued.shift();
      return value === undefined
        ? new Promise((resolve) => waiting.push(resolve))
        : Promise.resolve(value);
    },
  };
}

beforeEach(async () => {
  electron.listeners.clear();
  electron.handlers.clear();
  electron.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'lacuna-broker-test-'));
  temporaryDirectories.push(electron.userDataPath);
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const broker of activeBrokers.splice(0)) await broker.stop();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('Electron MCP companion broker interface', () => {
  it('binds tokens to purpose and preserves current and legacy AI handshakes', async () => {
    const renderer = rendererWindow();
    const broker = new CompanionBroker(() => renderer.window, vi.fn());
    activeBrokers.push(broker);
    await broker.start();
    const connection = await readCompanionConnectionFile(electron.userDataPath);

    const wrongPurpose = await openClient(connection.endpoint);
    wrongPurpose.send({
      type: 'hello',
      protocolVersion: connection.protocolVersion,
      token: connection.aiToken,
      client: { connectionId: 'data-1', name: 'Data client' },
    });
    await expect(wrongPurpose.next()).resolves.toEqual({
      type: 'fatal',
      error: { kind: 'forbidden', message: 'MCP companion authentication failed.' },
    });

    const current = await openClient(connection.endpoint);
    current.send({
      type: 'ai_hello',
      protocolVersion: AI_COMPANION_PROTOCOL_VERSION,
      token: connection.aiToken,
    });
    await expect(current.next()).resolves.toEqual({
      type: 'ai_ready',
      protocolVersion: AI_COMPANION_PROTOCOL_VERSION,
      appVersion: '0.2.3',
      capabilities: { leaseRenewal: true },
    });

    const legacy = await openClient(connection.endpoint);
    legacy.send({
      type: 'ai_hello',
      protocolVersion: LEGACY_AI_COMPANION_PROTOCOL_VERSION,
      token: connection.aiToken,
    });
    await expect(legacy.next()).resolves.toEqual({
      type: 'ai_ready',
      protocolVersion: LEGACY_AI_COMPANION_PROTOCOL_VERSION,
      appVersion: '0.2.3',
    });
    legacy.send({
      type: 'ai_request',
      id: 'renew-1',
      request: { type: 'renew_lease', connectionId: 'connection-1', runId: 'run-1' },
    });
    await expect(legacy.next()).resolves.toMatchObject({
      type: 'ai_result',
      id: 'renew-1',
      result: { ok: false, error: { kind: 'version_mismatch' } },
    });
  });

  it('keeps data identity stable and processes calls sequentially per socket', async () => {
    const renderer = rendererWindow();
    let finishFirst: ((result: { content: [] }) => void) | undefined;
    const execute = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ content: [] });
    const broker = new CompanionBroker(() => renderer.window, execute);
    activeBrokers.push(broker);
    await broker.start();
    const connection = await readCompanionConnectionFile(electron.userDataPath);
    const client = await openClient(connection.endpoint);
    const identity = { connectionId: 'data-1', name: 'Data client' };
    client.send({
      type: 'hello',
      protocolVersion: connection.protocolVersion,
      token: connection.token,
      client: identity,
    });
    await client.next();

    client.send({ type: 'call', id: 'call-1', tool: 'lacuna.list_courses', input: {}, client: identity });
    client.send({ type: 'call', id: 'call-2', tool: 'lacuna.list_courses', input: {}, client: identity });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    finishFirst?.({ content: [] });
    await expect(client.next()).resolves.toMatchObject({ type: 'result', id: 'call-1', ok: true });
    await expect(client.next()).resolves.toMatchObject({ type: 'result', id: 'call-2', ok: true });

    client.send({
      type: 'call',
      id: 'changed',
      tool: 'lacuna.list_courses',
      input: {},
      client: { ...identity, connectionId: 'data-2' },
    });
    await expect(client.next()).resolves.toEqual({
      type: 'fatal',
      error: { kind: 'internal', message: 'MCP companion connection identity changed unexpectedly.' },
    });
  });

  it('rejects untrusted connection IPC and composes live client and AI status', async () => {
    const renderer = rendererWindow();
    const broker = new CompanionBroker(() => renderer.window, vi.fn());
    activeBrokers.push(broker);
    await broker.start();
    const connection = await readCompanionConnectionFile(electron.userDataPath);
    const client = await openClient(connection.endpoint);
    client.send({
      type: 'hello',
      protocolVersion: connection.protocolVersion,
      token: connection.token,
      client: { connectionId: 'data-1', name: 'Data client' },
    });
    await client.next();
    client.send({
      type: 'call',
      id: 'missing-1',
      tool: 'lacuna.no_such_tool',
      input: {},
      client: { connectionId: 'data-1', name: 'Data client' },
    });
    await expect(client.next()).resolves.toMatchObject({
      type: 'result',
      id: 'missing-1',
      ok: false,
      error: { kind: 'not_found' },
    });

    expect(broker.status()).toMatchObject({
      clients: [{ connectionId: 'data-1', name: 'Data client', grants: [] }],
      aiRenderer: { status: 'waiting' },
    });
    expect(() => electron.handlers.get('mcp:connections:list')?.({
      sender: {},
      senderFrame: {},
    })).toThrow('Untrusted MCP connection request.');
  });

  it('uses private socket metadata and removes IPC, sockets and files on stop', async () => {
    const renderer = rendererWindow();
    const broker = new CompanionBroker(() => renderer.window, vi.fn());
    await broker.start();
    const connection = await readCompanionConnectionFile(electron.userDataPath);
    const client = await openClient(connection.endpoint);
    const metadataMode = (await stat(companionConnectionFilePath(electron.userDataPath))).mode & 0o777;
    const socketMode = process.platform === 'win32'
      ? 0o600
      : (await stat(connection.endpoint)).mode & 0o777;

    await broker.stop();

    expect(metadataMode).toBe(0o600);
    expect(socketMode).toBe(0o600);
    expect(client.socket.destroyed).toBe(true);
    await expect(readFile(companionConnectionFilePath(electron.userDataPath), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    if (process.platform !== 'win32') {
      await expect(stat(connection.endpoint)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect([...electron.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(electron.handlers.size).toBe(0);
  });
});
