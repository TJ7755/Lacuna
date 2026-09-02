// Stable lifecycle façade for Lacuna's Electron MCP runtime. Data-tool behaviour lives in
// dataBridge.ts; authenticated local data and AI sockets live in companionBroker.ts.
// Disposable --mcp-companion and --ai-companion processes forward stdio clients to that
// broker, while the embedded stdio server remains for legacy cold-start clients.

import { app, type BrowserWindow } from 'electron';
import log from 'electron-log';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import {
  TOOL_CONTRACT_REGISTRY,
  MCP_TOOL_SURFACE_VERSION,
} from '../../src/mcp/contracts/registry.js';
import type { McpClientConnection } from '../../src/mcp/connections.js';
import {
  companionLaunchCommand,
  companionProcessUserDataPath,
} from './connectionFile.js';
import { DataBridge } from './dataBridge.js';
import { CompanionBroker } from './companionBroker.js';

export interface McpStatus {
  running: boolean;
  toolCount: number;
  toolSurfaceVersion: number;
  clients: McpClientConnection[];
  companion: { command: string; args: string[]; env?: Record<string, string> };
  aiCompanion: { command: string; args: string[]; env?: Record<string, string> };
  aiRenderer: { status: 'ready' | 'waiting' | 'unavailable' };
}

let dataBridge: DataBridge | null = null;
let companionBroker: CompanionBroker | null = null;
let stdioHandle: StdioServerHandle | null = null;
let companionLaunchCommands: Pick<McpStatus, 'companion' | 'aiCompanion'> | null = null;
let started = false;
let startPromise: Promise<void> | null = null;

/**
 * StdioServerTransport writes protocol frames to stdout. Disable electron-log's console
 * transport first, then redirect ordinary console output to stderr before any server starts.
 */
function silenceStdoutNoise(): void {
  log.transports.console.level = false;
  const toStderr = (...args: unknown[]): void => {
    process.stderr.write(`${args.map(String).join(' ')}\n`);
  };
  // eslint-disable-next-line no-console -- redirecting console output is the mitigation.
  console.log = toStderr;
  // eslint-disable-next-line no-console
  console.info = toStderr;
  // eslint-disable-next-line no-console
  console.debug = toStderr;
}

/** Reports the live composed status for the Settings renderer. */
export function getMcpStatus(): McpStatus {
  const environment = {
    appPath: app.getAppPath(),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
    appImageFile: process.env.APPIMAGE,
  };
  companionLaunchCommands ??= {
    companion: companionLaunchCommand({
      ...environment,
      companionUserDataPath: companionProcessUserDataPath(),
    }, '--mcp-companion'),
    aiCompanion: companionLaunchCommand({
      ...environment,
      companionUserDataPath: companionProcessUserDataPath(),
    }, '--ai-companion'),
  };
  const brokerStatus = companionBroker?.status() ?? {
    clients: [],
    aiRenderer: { status: 'unavailable' as const },
  };
  return {
    running: started,
    toolCount: TOOL_CONTRACT_REGISTRY.length + 1,
    toolSurfaceVersion: MCP_TOOL_SURFACE_VERSION,
    ...brokerStatus,
    ...companionLaunchCommands,
  };
}

/**
 * Starts the data bridge, authenticated companion broker and legacy stdio transport.
 * `getWindow` remains dynamic: every dispatch observes the current Electron window.
 */
export function startMcpServer(getWindow: () => BrowserWindow | null): Promise<void> {
  if (started) return Promise.resolve();
  if (startPromise) return startPromise;
  const acquisition = acquireRuntime(getWindow);
  const tracked = acquisition.finally(() => {
    if (startPromise === tracked) startPromise = null;
  });
  startPromise = tracked;
  return tracked;
}

async function acquireRuntime(getWindow: () => BrowserWindow | null): Promise<void> {
  silenceStdoutNoise();
  companionLaunchCommands = null;
  try {
    const bridge = new DataBridge(getWindow);
    dataBridge = bridge;
    bridge.start();
    const broker = new CompanionBroker(
      getWindow,
      (tool, input, grants, client) => bridge.execute(tool, input, grants, client),
    );
    companionBroker = broker;
    await broker.start();
    stdioHandle = serveStdio(() => {
      const server = new McpServer({ name: 'lacuna', version: app.getVersion() });
      bridge.registerTools(server);
      return server;
    }, {
      legacy: 'serve',
      onerror: (error) => log.error('MCP stdio transport failed', error),
    });
    started = true;
  } catch (error) {
    const cleanupErrors = await disposeRuntime();
    if (cleanupErrors.length > 0) {
      const cleanupFailure = new AggregateError(cleanupErrors, 'MCP startup cleanup failed.');
      log.error('MCP startup cleanup failed', cleanupFailure);
      if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
        Reflect.defineProperty(error, 'cleanupErrors', { value: cleanupErrors, configurable: true });
      }
    }
    throw error;
  }
}

/** Stops the MCP runtime and drops all sockets, grants and pending renderer decisions. */
export async function stopMcpServer(): Promise<void> {
  if (startPromise) {
    try {
      await startPromise;
    } catch {
      return;
    }
  }
  if (!started && !dataBridge && !companionBroker && !stdioHandle) return;
  const cleanupErrors = await disposeRuntime();
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'MCP runtime cleanup failed.');
  }
}

async function disposeRuntime(): Promise<unknown[]> {
  const bridge = dataBridge;
  const broker = companionBroker;
  const stdio = stdioHandle;
  stdioHandle = null;
  companionBroker = null;
  dataBridge = null;
  companionLaunchCommands = null;
  started = false;
  const errors: unknown[] = [];
  try {
    bridge?.stop();
  } catch (error) {
    errors.push(error);
  }
  try {
    await broker?.stop();
  } catch (error) {
    errors.push(error);
  }
  try {
    await stdio?.close();
  } catch (error) {
    errors.push(error);
  }
  return errors;
}
