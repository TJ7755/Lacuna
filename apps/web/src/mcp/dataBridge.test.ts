import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BrowserWindow } from 'electron';
import { GrantStore } from './grants';
import { McpConnectionStore } from './connections';
import { TOOL_CONTRACT_REGISTRY } from './contracts/registry';
import { listCoursesContract } from './contracts/read';
import { createCourseContract } from './contracts/content';

const electron = vi.hoisted(() => {
  type Listener = (event: unknown, value: unknown) => void;
  type Handler = (event: unknown, ...args: unknown[]) => unknown;
  const listeners = new Map<string, Set<Listener>>();
  const handlers = new Map<string, Handler>();
  return {
    failHandleChannel: undefined as string | undefined,
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
        if (channel === electron.failHandleChannel) throw new Error('IPC registration failed.');
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

import { DataBridge } from '../../../desktop/mcp/dataBridge';

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
    electron.failHandleChannel = undefined;
    electron.listeners.clear();
    electron.handlers.clear();
  });

  it('removes partially-installed IPC when startup fails', () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    electron.failHandleChannel = 'mcp:grants:grant';

    expect(() => bridge.start()).toThrow('IPC registration failed.');

    expect([...electron.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(electron.handlers.size).toBe(0);
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

    expect(() =>
      electron.handlers.get('mcp:grants:list')?.({
        sender: {},
        senderFrame: {},
      }),
    ).toThrow('Untrusted MCP grant request.');

    bridge.stop();

    expect([...electron.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(electron.handlers.size).toBe(0);
  });

  it('fails a pending scope closed when the bridge stops', async () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();

    const result = bridge.execute(listCoursesContract, {}, new GrantStore(), {
      connectionId: 'client-1',
      name: 'Test client',
    });
    expect(renderer.webContents.send).toHaveBeenCalledWith(
      'mcp:scope',
      expect.objectContaining({ tool: 'lacuna.list_courses' }),
    );

    bridge.stop();

    await expect(result).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: '[internal] MCP server stopped.' }],
    });
    expect(
      renderer.webContents.send.mock.calls.filter(
        ([channel]) => channel === 'mcp:consent' || channel === 'mcp:invoke',
      ),
    ).toEqual([]);
  });

  it('ignores an untrusted scope reply and fences pending consent on shutdown', async () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();
    const result = bridge.execute(createCourseContract, { name: 'Biology' }, new GrantStore(), {
      connectionId: 'client-1',
      name: 'Test client',
    });
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
      content: [{ type: 'text', text: '[internal] MCP server stopped.' }],
    });
    expect(
      renderer.webContents.send.mock.calls.filter(([channel]) => channel === 'mcp:invoke'),
    ).toEqual([]);
  });

  it('settles a pending renderer invocation immediately on shutdown', async () => {
    const renderer = rendererWindow();
    const bridge = new DataBridge(() => renderer.window);
    bridge.start();
    const result = bridge.execute(listCoursesContract, {}, new GrantStore(), {
      connectionId: 'client-1',
      name: 'Test client',
    });
    const scopeRequest = renderer.webContents.send.mock.calls[0][1] as { id: string };
    emit('mcp:scope:reply', renderer.trustedEvent, {
      id: scopeRequest.id,
      ok: true,
      targets: [{ courseId: '__global__', label: 'All Lacuna data' }],
    });
    await vi.waitFor(() => {
      expect(renderer.webContents.send).toHaveBeenCalledWith(
        'mcp:invoke',
        expect.objectContaining({ tool: 'lacuna.list_courses' }),
      );
    });

    bridge.stop();

    await expect(result).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: '[internal] MCP server stopped.' }],
    });
  });

  it.each(['scope', 'consent'] as const)(
    'blocks a disconnected companion whose %s reply arrives late',
    async (stage) => {
      const renderer = rendererWindow();
      const bridge = new DataBridge(() => renderer.window);
      bridge.start();
      const clients = new McpConnectionStore();
      const client = { connectionId: 'client-1', name: 'Test client' };
      clients.connect(client);
      const grants = clients.grants(client.connectionId);
      const result = bridge.execute(createCourseContract, { name: 'Biology' }, grants, client);
      const scopeRequest = renderer.webContents.send.mock.calls[0][1] as { id: string };
      if (stage === 'scope') clients.disconnect(client.connectionId);
      emit('mcp:scope:reply', renderer.trustedEvent, {
        id: scopeRequest.id,
        ok: true,
        targets: [{ courseId: '__global__', label: 'All Lacuna data' }],
      });
      if (stage === 'consent') {
        await vi.waitFor(() => expect(renderer.webContents.send).toHaveBeenCalledTimes(2));
        const consentRequest = renderer.webContents.send.mock.calls[1][1] as { id: string };
        clients.disconnect(client.connectionId);
        emit('mcp:consent:reply', renderer.trustedEvent, {
          id: consentRequest.id,
          approved: true,
        });
      }
      // A late approval must not restore the detached store or dispatch a write.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (stage === 'scope')
        expect(
          renderer.webContents.send.mock.calls.filter(([channel]) => channel === 'mcp:consent'),
        ).toEqual([]);
      expect(grants.list()).toEqual([]);
      expect(
        renderer.webContents.send.mock.calls.filter(([channel]) => channel === 'mcp:invoke'),
      ).toEqual([]);
      bridge.stop();
      await expect(result).resolves.toMatchObject({ isError: true });
    },
  );
});
