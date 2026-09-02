import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bridgeStart: vi.fn(),
  bridgeStop: vi.fn(),
  bridgeRegister: vi.fn(),
  bridgeExecute: vi.fn(),
  brokerStart: vi.fn().mockResolvedValue(undefined),
  brokerStop: vi.fn().mockResolvedValue(undefined),
  brokerStatus: vi.fn(() => ({
    clients: [{
      connectionId: 'client-1',
      name: 'Test client',
      connectedAt: 1,
      lastActivityAt: 1,
      grants: [],
    }],
    aiRenderer: { status: 'ready' as const },
  })),
  serveStdio: vi.fn(),
  closeStdio: vi.fn().mockResolvedValue(undefined),
  companionProcessUserDataPath: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/app',
    getName: () => 'Lacuna',
    getVersion: () => '0.2.3',
    getPath: () => '/profile',
    isPackaged: true,
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { console: { level: 'info' } },
    error: vi.fn(),
  },
}));

vi.mock('../../electron/mcp/dataBridge.js', () => ({
  DataBridge: class {
    start = mocks.bridgeStart;
    stop = mocks.bridgeStop;
    registerTools = mocks.bridgeRegister;
    execute = mocks.bridgeExecute;
  },
}));

vi.mock('../../electron/mcp/companionBroker.js', () => ({
  CompanionBroker: class {
    start = mocks.brokerStart;
    stop = mocks.brokerStop;
    status = mocks.brokerStatus;
  },
}));

vi.mock('../../electron/mcp/connectionFile.js', () => ({
  companionProcessUserDataPath: mocks.companionProcessUserDataPath,
  companionLaunchCommand: (_environment: unknown, mode: string) => ({
    command: '/app/Lacuna',
    args: [mode, mocks.companionProcessUserDataPath.mock.results.at(-1)?.value],
  }),
}));

vi.mock('@modelcontextprotocol/server', () => ({
  McpServer: class {},
}));

vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: mocks.serveStdio,
}));

/* eslint-disable no-console -- the lifecycle intentionally replaces and restores these methods. */
const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
};
/* eslint-enable no-console */

describe('Electron MCP server lifecycle façade', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const value of Object.values(mocks)) {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    }
    mocks.brokerStart.mockResolvedValue(undefined);
    mocks.brokerStop.mockResolvedValue(undefined);
    mocks.closeStdio.mockResolvedValue(undefined);
    mocks.companionProcessUserDataPath
      .mockReturnValueOnce('/tmp/companion-1')
      .mockReturnValueOnce('/tmp/companion-2');
    mocks.serveStdio.mockImplementation((createServer: () => unknown) => {
      createServer();
      return { close: mocks.closeStdio };
    });
  });

  afterEach(async () => {
    const server = await import('../../electron/mcp/server');
    await server.stopMcpServer();
    /* eslint-disable no-console -- restore the process-wide stdio mitigation after each test. */
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    /* eslint-enable no-console */
  });

  it('exports only the unchanged runtime interface and caches launch commands', async () => {
    const server = await import('../../electron/mcp/server');

    expect(Object.keys(server).sort()).toEqual([
      'getMcpStatus',
      'startMcpServer',
      'stopMcpServer',
    ]);
    const first = server.getMcpStatus();
    const second = server.getMcpStatus();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      running: false,
      clients: [],
      aiRenderer: { status: 'unavailable' },
      companion: { args: ['--mcp-companion', '/tmp/companion-1'] },
      aiCompanion: { args: ['--ai-companion', '/tmp/companion-2'] },
    });
    expect(mocks.companionProcessUserDataPath).toHaveBeenCalledTimes(2);
  });

  it('starts and stops idempotently while composing broker status', async () => {
    const server = await import('../../electron/mcp/server');
    const getWindow = () => null;

    await server.startMcpServer(getWindow);
    await server.startMcpServer(getWindow);

    expect(mocks.bridgeStart).toHaveBeenCalledOnce();
    expect(mocks.brokerStart).toHaveBeenCalledOnce();
    expect(mocks.serveStdio).toHaveBeenCalledOnce();
    expect(mocks.bridgeRegister).toHaveBeenCalledOnce();
    expect(server.getMcpStatus()).toMatchObject({
      running: true,
      clients: [{ connectionId: 'client-1' }],
      aiRenderer: { status: 'ready' },
    });

    await server.stopMcpServer();
    await server.stopMcpServer();

    expect(mocks.bridgeStop).toHaveBeenCalledOnce();
    expect(mocks.brokerStop).toHaveBeenCalledOnce();
    expect(mocks.closeStdio).toHaveBeenCalledOnce();
    expect(server.getMcpStatus().running).toBe(false);
  });

  it.each(['broker', 'stdio'] as const)(
    'cleans up a partial start when the %s transport fails',
    async (failure) => {
      const server = await import('../../electron/mcp/server');
      if (failure === 'broker') {
        mocks.brokerStart.mockRejectedValueOnce(new Error('broker failed'));
      } else {
        mocks.serveStdio.mockImplementationOnce(() => {
          throw new Error('stdio failed');
        });
      }

      await expect(server.startMcpServer(() => null)).rejects.toThrow(`${failure} failed`);

      expect(mocks.bridgeStop).toHaveBeenCalledOnce();
      expect(mocks.brokerStop).toHaveBeenCalledOnce();
      expect(server.getMcpStatus().running).toBe(false);
    },
  );
});
