import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BrowserWindow } from 'electron';
import { GrantStore } from './grants';
import { TOOL_CONTRACT_REGISTRY } from './contracts/registry';
import { listCoursesContract } from './contracts/read';
import { createCourseContract } from './contracts/content';

const electron = vi.hoisted(() => {
  type Listener = (event: unknown, value: unknown) => void;
  type Handler = (event: unknown, ...args: unknown[]) => unknown;
  const listeners = new Map<string, Set<Listener>>();
  const handlers = new Map<string, Handler>();
  return {
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
    getName: () => 'Lacuna',
    getVersion: () => '0.2.3',
  },
  ipcMain: electron.ipcMain,
}));

import { DataBridge } from '../../electron/mcp/dataBridge';

function rendererWindow() {
  const webContents = {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  };
  return {
    window: {
      isDestroyed: () => false,
      webContents,
    } as unknown as BrowserWindow,
    webContents,
    trustedEvent: { sender: webContents, senderFrame: webContents.mainFrame },
  };
}

function emit(channel: string, event: unknown, value: unknown): void {
  for (const listener of electron.listeners.get(channel) ?? []) listener(event, value);
}

describe('Electron MCP data bridge interface', () => {
  beforeEach(() => {
    electron.listeners.clear();
    electron.handlers.clear();
  });

  it('registers server information before every contract tool in exact order', () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    const names: string[] = [];
    const server = {
      registerTool(name: string) {
        names.push(name);
      },
    } as unknown as McpServer;

    bridge.start();
    bridge.registerTools(server);

    expect(names).toEqual([
      'lacuna.get_server_info',
      ...TOOL_CONTRACT_REGISTRY.map((tool) => tool.name),
    ]);
    bridge.stop();
  });

  it('rejects untrusted grant IPC and removes every installed listener and handler', () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();

    expect(() => electron.handlers.get('mcp:grants:list')?.({
      sender: {},
      senderFrame: {},
    })).toThrow('Untrusted MCP grant request.');

    bridge.stop();

    expect([...electron.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(electron.handlers.size).toBe(0);
  });

  it('fails a pending scope closed when the bridge stops', async () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();

    const result = bridge.execute(
      listCoursesContract,
      {},
      new GrantStore(),
      { connectionId: 'client-1', name: 'Test client' },
    );
    expect(renderer.webContents.send).toHaveBeenCalledWith(
      'mcp:scope',
      expect.objectContaining({ tool: 'lacuna.list_courses' }),
    );

    bridge.stop();

    await expect(result).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: '[internal] MCP server stopped.' }],
    });
  });

  it('ignores an untrusted scope reply and denies pending consent on shutdown', async () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();
    const result = bridge.execute(
      createCourseContract,
      { name: 'Biology' },
      new GrantStore(),
      { connectionId: 'client-1', name: 'Test client' },
    );
    const scopeRequest = renderer.webContents.send.mock.calls[0][1] as { id: string };
    const scopeReply = {
      id: scopeRequest.id,
      ok: true,
      targets: [{ courseId: '__global__', label: 'All Lacuna data' }],
    };

    emit('mcp:scope:reply', { sender: {}, senderFrame: {} }, scopeReply);
    expect(renderer.webContents.send).toHaveBeenCalledTimes(1);
    emit('mcp:scope:reply', renderer.trustedEvent, scopeReply);
    await vi.waitFor(() => {
      expect(renderer.webContents.send).toHaveBeenCalledWith(
        'mcp:consent',
        expect.objectContaining({ tool: 'lacuna.create_course' }),
      );
    });

    bridge.stop();

    await expect(result).resolves.toEqual({
      isError: true,
      content: [{
        type: 'text',
        text: '[forbidden] This action needs "write" access to the whole database, which has not been granted yet.',
      }],
    });
  });
});
